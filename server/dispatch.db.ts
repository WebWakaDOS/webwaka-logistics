/**
 * T-LOG-03: Dispatch Database Helpers
 * All queries are scoped by tenantId for multi-tenant isolation.
 */

import { and, eq, isNull, inArray } from "drizzle-orm";
import { parcels, users, type Parcel, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { createLogger } from "./logger";

const logger = createLogger("DispatchDB");

// ─────────────────────────────────────────────────────────────────────────────
// Parcel Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all unassigned PENDING parcels for a tenant.
 * These are candidates for cluster-based dispatch.
 * Enforces tenant isolation and excludes soft-deleted records.
 */
export function getUnassignedParcels(tenantId: string): Parcel[] {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(parcels)
    .where(
      and(
        eq(parcels.tenantId, tenantId),
        eq(parcels.status, "PENDING"),
        isNull(parcels.assignedAgentId),
        isNull(parcels.deletedAt),
      ),
    )
    .all();
}

/**
 * Bulk-assign a set of parcels to a rider.
 * Updates assignedAgentId for all parcel IDs provided, scoped to the tenant.
 * Returns the count of parcels actually updated.
 */
export function bulkAssignParcels(
  tenantId: string,
  parcelIds: number[],
  agentId: number,
): number {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (parcelIds.length === 0) return 0;

  logger.info("Bulk assigning parcels", { tenantId, parcelIds, agentId });

  db.update(parcels)
    .set({
      assignedAgentId: agentId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(parcels.tenantId, tenantId),
        inArray(parcels.id, parcelIds),
        isNull(parcels.deletedAt),
      ),
    )
    .run();

  return parcelIds.length;
}

/**
 * Unassign a parcel cluster — sets assignedAgentId back to null.
 * Used when a dispatcher needs to re-cluster or reassign.
 */
export function unassignParcels(tenantId: string, parcelIds: number[]): number {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  if (parcelIds.length === 0) return 0;

  db.update(parcels)
    .set({ assignedAgentId: null, updatedAt: new Date() })
    .where(
      and(
        eq(parcels.tenantId, tenantId),
        inArray(parcels.id, parcelIds),
        isNull(parcels.deletedAt),
      ),
    )
    .run();

  return parcelIds.length;
}

/**
 * Update the geocoded coordinates for a single parcel.
 * Called after external geocoding resolves for a new parcel.
 */
export function updateParcelCoordinates(
  tenantId: string,
  parcelId: number,
  lat: number,
  lng: number,
): void {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  db.update(parcels)
    .set({ recipientLat: lat, recipientLng: lng, updatedAt: new Date() })
    .where(and(eq(parcels.tenantId, tenantId), eq(parcels.id, parcelId)))
    .run();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface AvailableAgent {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
}

/**
 * Return all users with the 'agent' or 'admin' role who can be assigned deliveries.
 * In production, this would filter by availability and current workload.
 */
export function getAvailableAgents(): AvailableAgent[] {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const rows = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .all() as AvailableAgent[];

  return rows.filter(u => u.role === "agent" || u.role === "admin");
}

/**
 * Return summary stats for all parcels in a tenant useful to the dispatch dashboard.
 */
export interface DispatchSummary {
  totalUnassigned: number;
  totalPending: number;
  totalInTransit: number;
}

export function getDispatchSummary(tenantId: string): DispatchSummary {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const all = db
    .select({ status: parcels.status, assignedAgentId: parcels.assignedAgentId })
    .from(parcels)
    .where(and(eq(parcels.tenantId, tenantId), isNull(parcels.deletedAt)))
    .all();

  return {
    totalUnassigned: all.filter(p => p.status === "PENDING" && !p.assignedAgentId).length,
    totalPending: all.filter(p => p.status === "PENDING").length,
    totalInTransit: all.filter(
      p => p.status === "IN_TRANSIT" || p.status === "OUT_FOR_DELIVERY",
    ).length,
  };
}
