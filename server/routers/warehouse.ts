/**
 * T-LOG-04: Warehouse tRPC Router
 * Provides endpoints for inbound receiving operations.
 * All routes are tenant-scoped and require authentication.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { createLogger } from "../logger";
import { getDb } from "../db";
import { parcels } from "../../drizzle/schema";

const logger = createLogger("WarehouseRouter");

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────────────────────────────────

const bulkReceiveScansInput = z.object({
  tenantId: z.string().min(1).max(64),
  /**
   * Array of tracking numbers scanned at the receiving dock.
   * Capped at 500 per flush cycle — the sync worker batches large queues
   * into multiple requests if needed.
   */
  trackingNumbers: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(500),
});

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const warehouseRouter = router({
  /**
   * MUTATION /warehouse/bulkReceiveScans
   *
   * Marks a batch of parcels as IN_WAREHOUSE (inbound received).
   * Called by the background sync worker when the device comes back online
   * after an offline scanning session.
   *
   * Logic:
   *  1. Look up all parcels matching the tracking numbers AND tenantId.
   *  2. Parcels already IN_WAREHOUSE (or past that state) are skipped and
   *     returned in `alreadyReceived`.
   *  3. Tracking numbers that match no parcel are returned in `notFound`.
   *  4. Eligible parcels are bulk-updated to IN_WAREHOUSE.
   *
   * Idempotent — safe to call multiple times with the same batch.
   */
  bulkReceiveScans: protectedProcedure
    .input(bulkReceiveScansInput)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { tenantId, trackingNumbers } = input;

      // De-duplicate the request list (client may send duplicates from rapid scanning).
      const uniqueTrackingNumbers = Array.from(new Set(trackingNumbers));

      logger.info("Bulk receiving inbound parcels", {
        tenantId,
        count: uniqueTrackingNumbers.length,
        requestedBy: ctx.user?.openId,
      });

      // ── 1. Fetch all matching parcels (tenant-scoped) ──────────────────────
      const found = db
        .select({
          id: parcels.id,
          trackingNumber: parcels.trackingNumber,
          status: parcels.status,
          tenantId: parcels.tenantId,
        })
        .from(parcels)
        .where(
          and(
            eq(parcels.tenantId, tenantId),
            inArray(parcels.trackingNumber, uniqueTrackingNumbers),
            isNull(parcels.deletedAt),
          ),
        )
        .all();

      // ── 2. Classify found parcels ──────────────────────────────────────────
      /** Statuses that mean the parcel has already passed inbound receiving */
      const PAST_INBOUND_STATUSES = new Set([
        "IN_WAREHOUSE",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "RETURNED",
      ]);

      const toUpdate: typeof found = [];
      const alreadyReceived: string[] = [];

      for (const parcel of found) {
        if (PAST_INBOUND_STATUSES.has(parcel.status)) {
          alreadyReceived.push(parcel.trackingNumber);
        } else {
          toUpdate.push(parcel);
        }
      }

      // ── 3. Determine not-found ─────────────────────────────────────────────
      const foundTrackingNumbers = new Set(found.map(p => p.trackingNumber));
      const notFound = uniqueTrackingNumbers.filter(
        tn => !foundTrackingNumbers.has(tn),
      );

      // ── 4. Bulk update eligible parcels → IN_WAREHOUSE ────────────────────
      if (toUpdate.length > 0) {
        const parcelIds = toUpdate.map(p => p.id);
        db.update(parcels)
          .set({ status: "IN_WAREHOUSE", updatedAt: new Date() })
          .where(
            and(
              eq(parcels.tenantId, tenantId),
              inArray(parcels.id, parcelIds),
            ),
          )
          .run();
      }

      logger.info("Bulk receive complete", {
        tenantId,
        receivedCount: toUpdate.length,
        alreadyReceived: alreadyReceived.length,
        notFound: notFound.length,
      });

      return {
        receivedCount: toUpdate.length,
        notFound,
        alreadyReceived,
      };
    }),

  /**
   * QUERY /warehouse/receivedToday
   *
   * Returns the count of parcels received into the warehouse today
   * for the given tenant. Used by the scanner dashboard summary.
   */
  receivedToday: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Midnight UTC of the current day — parcels received since then
      const todayMidnight = new Date();
      todayMidnight.setUTCHours(0, 0, 0, 0);

      const received = db
        .select({ id: parcels.id })
        .from(parcels)
        .where(
          and(
            eq(parcels.tenantId, input.tenantId),
            eq(parcels.status, "IN_WAREHOUSE"),
            isNull(parcels.deletedAt),
            // Only parcels whose updatedAt is on or after today's midnight UTC
            gte(parcels.updatedAt, todayMidnight),
          ),
        )
        .all();

      return { count: received.length };
    }),
});
