/**
 * Parcel & Delivery — Database Query Helpers [Part 10.4]
 * Blueprint: [Part 9.2] — injected database service, no direct client instantiation.
 * All queries are scoped by tenantId for multi-tenant isolation.
 * Soft deletes enforced via deletedAt IS NULL filters.
 */

import { and, desc, eq, isNull, like } from "drizzle-orm";
import {
  InsertParcel,
  InsertParcelUpdate,
  InsertProofOfDelivery,
  ParcelStatus,
  parcelUpdates,
  parcels,
  proofOfDelivery,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createLogger } from "./logger";

const logger = createLogger("ParcelsDB");

// ─────────────────────────────────────────────────────────────────────────────
// Tracking Number Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unique tracking number in the format WW-{YYYYMMDD}-{6-char-random}.
 * Nigeria First: prefix "WW" for WebWaka, date-stamped for traceability.
 */
export function generateTrackingNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WW-${date}-${random}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcel Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function createParcel(data: InsertParcel) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Creating parcel", { tenantId: data.tenantId, trackingNumber: data.trackingNumber });
  db.insert(parcels).values(data).run();

  const result = db
    .select()
    .from(parcels)
    .where(
      and(
        eq(parcels.tenantId, data.tenantId),
        eq(parcels.trackingNumber, data.trackingNumber!),
      ),
    )
    .limit(1)
    .all();

  return result[0];
}

export async function listParcels(tenantId: string, limit = 50, offset = 0) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(parcels)
    .where(and(eq(parcels.tenantId, tenantId), isNull(parcels.deletedAt)))
    .orderBy(desc(parcels.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function getParcelByTracking(tenantId: string, trackingNumber: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(parcels)
    .where(
      and(
        eq(parcels.tenantId, tenantId),
        eq(parcels.trackingNumber, trackingNumber),
        isNull(parcels.deletedAt),
      ),
    )
    .limit(1)
    .all();

  return result[0] ?? null;
}

export async function getParcelById(tenantId: string, id: number) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(parcels)
    .where(and(eq(parcels.tenantId, tenantId), eq(parcels.id, id), isNull(parcels.deletedAt)))
    .limit(1)
    .all();

  return result[0] ?? null;
}

/** Public tracking — no tenantId required, for customer-facing tracking page */
export async function getParcelByTrackingPublic(trackingNumber: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(parcels)
    .where(and(eq(parcels.trackingNumber, trackingNumber), isNull(parcels.deletedAt)))
    .limit(1)
    .all();

  return result[0] ?? null;
}

export async function updateParcelStatus(
  tenantId: string,
  parcelId: number,
  status: ParcelStatus,
  extra?: Partial<Pick<InsertParcel, "assignedAgentId" | "estimatedDeliveryAt" | "actualDeliveryAt">>,
) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Updating parcel status", { tenantId, parcelId, status });

  db
    .update(parcels)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(and(eq(parcels.tenantId, tenantId), eq(parcels.id, parcelId)))
    .run();
}

export async function softDeleteParcel(tenantId: string, parcelId: number) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Soft-deleting parcel", { tenantId, parcelId });
  db
    .update(parcels)
    .set({ deletedAt: new Date() })
    .where(and(eq(parcels.tenantId, tenantId), eq(parcels.id, parcelId)))
    .run();
}

export async function searchParcels(tenantId: string, query: string, limit = 20) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(parcels)
    .where(
      and(
        eq(parcels.tenantId, tenantId),
        isNull(parcels.deletedAt),
        like(parcels.trackingNumber, `%${query}%`),
      ),
    )
    .limit(limit)
    .all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcel Update Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function addParcelUpdate(data: InsertParcelUpdate) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Adding parcel update", {
    tenantId: data.tenantId,
    parcelId: data.parcelId,
    status: data.status,
  });

  db.insert(parcelUpdates).values(data).run();
}

export async function getParcelUpdates(tenantId: string, parcelId: number) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(parcelUpdates)
    .where(and(eq(parcelUpdates.tenantId, tenantId), eq(parcelUpdates.parcelId, parcelId)))
    .orderBy(desc(parcelUpdates.createdAt))
    .all();
}

/** Public — for customer tracking page */
export async function getParcelUpdatesPublic(parcelId: number) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(parcelUpdates)
    .where(eq(parcelUpdates.parcelId, parcelId))
    .orderBy(desc(parcelUpdates.createdAt))
    .all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Proof of Delivery Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function createProofOfDelivery(data: InsertProofOfDelivery) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Creating proof of delivery", { tenantId: data.tenantId, parcelId: data.parcelId });
  db.insert(proofOfDelivery).values(data).run();

  const result = db
    .select()
    .from(proofOfDelivery)
    .where(
      and(
        eq(proofOfDelivery.tenantId, data.tenantId),
        eq(proofOfDelivery.parcelId, data.parcelId),
        isNull(proofOfDelivery.deletedAt),
      ),
    )
    .orderBy(desc(proofOfDelivery.createdAt))
    .limit(1)
    .all();

  return result[0];
}

export async function getProofOfDelivery(tenantId: string, parcelId: number) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(proofOfDelivery)
    .where(
      and(
        eq(proofOfDelivery.tenantId, tenantId),
        eq(proofOfDelivery.parcelId, parcelId),
        isNull(proofOfDelivery.deletedAt),
      ),
    )
    .limit(1)
    .all();

  return result[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// P12: Transport Integration Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Links a parcel to a transport trip and sets seatAssignmentStatus to "pending".
 * Called before publishing parcel.seats_required to the transport service.
 */
export async function linkParcelToTrip(
  tenantId: string,
  parcelId: number,
  tripId: string,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Linking parcel to transport trip", { tenantId, parcelId, tripId });

  db.update(parcels)
    .set({ tripId, seatAssignmentStatus: "pending", updatedAt: new Date() })
    .where(and(eq(parcels.tenantId, tenantId), eq(parcels.id, parcelId)))
    .run();
}
