/**
 * Fleet Telemetry — Database Helpers
 * Manages rider GPS positions for real-time fleet tracking and geofencing.
 */

import { and, eq, gt, inArray } from "drizzle-orm";
import { riderLocations, parcels, users, type RiderLocation } from "../drizzle/schema";
import { getDb } from "./db";
import { createLogger } from "./logger";

const logger = createLogger("FleetDB");

/** Haversine distance in metres between two coordinates */
export function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface RiderLocationRow extends RiderLocation {
  riderName: string | null;
  riderEmail: string | null;
  riderRole: string;
}

/**
 * Upsert (insert or replace) a rider's last known location.
 * Uses SQLite INSERT OR REPLACE semantics via the UNIQUE constraint on userId.
 */
export function upsertRiderLocation(
  userId: number,
  tenantId: string,
  lat: number,
  lng: number,
  speedKmh?: number | null,
  accuracyM?: number | null,
): void {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const now = Date.now();

  db.insert(riderLocations)
    .values({
      userId,
      tenantId,
      lat,
      lng,
      speedKmh: speedKmh ?? null,
      accuracyM: accuracyM ?? null,
      reportedAt: now,
      statusLabel: "Active",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: riderLocations.userId,
      set: {
        tenantId,
        lat,
        lng,
        speedKmh: speedKmh ?? null,
        accuracyM: accuracyM ?? null,
        reportedAt: now,
        statusLabel: "Active",
        updatedAt: new Date(),
      },
    })
    .run();

  logger.info("Rider location upserted", { userId, lat, lng });
}

/**
 * Return all riders who have reported their location in the last N minutes.
 * Joins with the users table to include rider name & email for display.
 */
export function getActiveRiderLocations(
  tenantId: string,
  staleAfterMinutes = 30,
): RiderLocationRow[] {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const cutoff = Date.now() - staleAfterMinutes * 60 * 1000;

  const rows = db
    .select({
      id: riderLocations.id,
      userId: riderLocations.userId,
      tenantId: riderLocations.tenantId,
      lat: riderLocations.lat,
      lng: riderLocations.lng,
      speedKmh: riderLocations.speedKmh,
      accuracyM: riderLocations.accuracyM,
      reportedAt: riderLocations.reportedAt,
      statusLabel: riderLocations.statusLabel,
      updatedAt: riderLocations.updatedAt,
      riderName: users.name,
      riderEmail: users.email,
      riderRole: users.role,
    })
    .from(riderLocations)
    .leftJoin(users, eq(riderLocations.userId, users.id))
    .where(
      and(
        eq(riderLocations.tenantId, tenantId),
        gt(riderLocations.reportedAt, cutoff),
      ),
    )
    .all() as RiderLocationRow[];

  return rows;
}

export interface GeofenceHit {
  parcelId: number;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  distanceMetres: number;
}

/**
 * Check if a rider's current position is within the geofence radius (1 km)
 * of any OUT_FOR_DELIVERY parcels assigned to them.
 * Returns a list of parcels within the fence.
 */
export function checkGeofenceHits(
  tenantId: string,
  agentId: number,
  riderLat: number,
  riderLng: number,
  radiusMetres = 1000,
): GeofenceHit[] {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const candidates = db
    .select()
    .from(parcels)
    .where(
      and(
        eq(parcels.tenantId, tenantId),
        eq(parcels.assignedAgentId, agentId),
        eq(parcels.status, "OUT_FOR_DELIVERY"),
      ),
    )
    .all();

  const hits: GeofenceHit[] = [];

  for (const p of candidates) {
    if (p.recipientLat == null || p.recipientLng == null) continue;
    const dist = haversineMetres(riderLat, riderLng, p.recipientLat, p.recipientLng);
    if (dist <= radiusMetres) {
      hits.push({
        parcelId: p.id,
        trackingNumber: p.trackingNumber,
        recipientName: p.recipientName,
        recipientPhone: p.recipientPhone,
        recipientAddress: p.recipientAddress,
        distanceMetres: Math.round(dist),
      });
    }
  }

  return hits;
}
