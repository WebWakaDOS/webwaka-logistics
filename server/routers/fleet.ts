/**
 * Fleet Telemetry tRPC Router
 * Provides real-time geofencing and fleet tracking endpoints.
 * Phase 3 features: GPS reporting, active rider views, proximity notifications.
 */

import { z } from "zod";
import { protectedProcedure, agentProcedure, router } from "../_core/trpc";
import { createLogger } from "../logger";
import {
  upsertRiderLocation,
  getActiveRiderLocations,
  checkGeofenceHits,
} from "../fleet.db";
import { sendTermiiSms } from "@webwaka/core";
import { ENV } from "../_core/env";

const logger = createLogger("FleetRouter");

/** 1 km geofence radius — triggers SMS notification to customer */
const GEOFENCE_RADIUS_M = 1000;

export const fleetRouter = router({
  /**
   * POST /fleet/reportLocation
   * Rider app reports its current GPS position.
   * - Upserts the rider's position in rider_locations.
   * - Runs geofence check against OUT_FOR_DELIVERY parcels.
   * - Sends SMS to recipient if rider enters 1 km radius.
   */
  reportLocation: agentProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        speedKmh: z.number().min(0).max(300).optional(),
        accuracyM: z.number().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // 1. Persist location
      upsertRiderLocation(
        userId,
        input.tenantId,
        input.lat,
        input.lng,
        input.speedKmh,
        input.accuracyM,
      );

      // 2. Geofence check — find any OUT_FOR_DELIVERY parcels within 1 km
      const hits = checkGeofenceHits(
        input.tenantId,
        userId,
        input.lat,
        input.lng,
        GEOFENCE_RADIUS_M,
      );

      const notified: number[] = [];

      for (const hit of hits) {
        // Send a proximity SMS to the customer (non-fatal if it fails)
        const geofenceMessage =
          `[WebWaka] Hi ${hit.recipientName}, your delivery rider is approximately ` +
          `${hit.distanceMetres}m away and will arrive shortly. ` +
          `Parcel: ${hit.trackingNumber}. Please be available to receive your package.`;

        const sent = ENV.termiiApiKey
          ? await sendTermiiSms(hit.recipientPhone, geofenceMessage, ENV.termiiApiKey, "WebWaka")
              .then(r => r.success)
              .catch(() => false)
          : false;

        if (sent) {
          notified.push(hit.parcelId);
          logger.info("Geofence SMS sent", {
            parcelId: hit.parcelId,
            distanceMetres: hit.distanceMetres,
            rider: userId,
          });
        }
      }

      return {
        success: true,
        geofenceHits: hits.length,
        notified,
      };
    }),

  /**
   * GET /fleet/activeRiders
   * Returns all riders who have reported their GPS in the last 30 minutes.
   * Used by the Fleet Telemetry Dashboard.
   */
  getActiveRiders: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        staleAfterMinutes: z.number().int().min(1).max(1440).default(30),
      }),
    )
    .query(({ input }) => {
      const riders = getActiveRiderLocations(input.tenantId, input.staleAfterMinutes);

      logger.info("Active riders fetched", {
        tenantId: input.tenantId,
        count: riders.length,
      });

      return {
        success: true,
        riders: riders.map(r => ({
          userId: r.userId,
          riderName: r.riderName,
          riderEmail: r.riderEmail,
          riderRole: r.riderRole,
          lat: r.lat,
          lng: r.lng,
          speedKmh: r.speedKmh,
          accuracyM: r.accuracyM,
          reportedAt: r.reportedAt,
          statusLabel: r.statusLabel,
        })),
      };
    }),
});
