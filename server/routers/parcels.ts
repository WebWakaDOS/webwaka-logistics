/**
 * Parcel & Delivery tRPC Router [Part 10.4]
 * Blueprint: [Part 9.3] — platform response format, RBAC, injected DB, zero console.log.
 * All write operations require authentication via protectedProcedure.
 * Public tracking is exposed via publicProcedure for customer-facing use.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PARCEL_PRIORITY, PARCEL_STATUS } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { publicProcedure, protectedProcedure, agentProcedure, adminProcedure, router } from "../_core/trpc";
import { createLogger } from "../logger";
import { publishEvent } from "../eventBus";
import { publishSeatsRequired } from "../transport-events";
import {
  addParcelUpdate,
  createParcel,
  createProofOfDelivery,
  generateTrackingNumber,
  getParcelById,
  getParcelByTracking,
  getParcelByTrackingPublic,
  getParcelUpdates,
  getParcelUpdatesPublic,
  getParcelStats,
  getProofOfDelivery,
  linkParcelToTrip,
  listParcels,
  listParcelsCursor,
  listParcelsForAgent,
  listPodRecords,
  markOtpVerified,
  searchParcels,
  softDeleteParcel,
  storeParcelOtp,
  updateParcelStatus,
  updatePodImageUrl,
} from "../parcels.db";
import {
  buildOfflineToken,
  generateOtp,
  hashOtp,
  isOtpExpired,
  otpExpiryTimestamp,
  sendOtpSms,
  verifyOfflineToken,
  verifyOtpHash,
} from "../otp";

const logger = createLogger("ParcelsRouter");

// ─────────────────────────────────────────────────────────────────────────────
// Input Validators
// ─────────────────────────────────────────────────────────────────────────────

const createParcelInput = z.object({
  tenantId: z.string().min(1).max(64),
  senderName: z.string().min(1).max(255),
  senderPhone: z.string().min(7).max(20),
  senderAddress: z.string().min(1),
  recipientName: z.string().min(1).max(255),
  recipientPhone: z.string().min(7).max(20),
  recipientAddress: z.string().min(1),
  recipientCity: z.string().min(1).max(100),
  recipientState: z.string().min(1).max(100),
  description: z.string().optional(),
  weightGrams: z.number().int().min(0).default(0),
  /** Delivery fee in kobo (NGN × 100) per [Part 9.2] */
  deliveryFeeKobo: z.number().int().min(0).default(0),
  /** Insurance value in kobo per [Part 9.2] */
  insuranceValueKobo: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("NGN"),
  priority: z.enum(PARCEL_PRIORITY).default("STANDARD"),
  estimatedDeliveryAt: z.date().optional(),
  /** Client-generated ID for offline sync / optimistic updates [Part 6, CORE-1] */
  clientId: z.string().max(64).optional(),
});

const addUpdateInput = z.object({
  tenantId: z.string().min(1).max(64),
  parcelId: z.number().int().positive(),
  status: z.enum(PARCEL_STATUS),
  location: z.string().max(255).optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  notes: z.string().optional(),
});

const podInput = z.object({
  tenantId: z.string().min(1).max(64),
  parcelId: z.number().int().positive(),
  receivedByName: z.string().min(1).max(255),
  receivedByRelation: z.string().max(100).default("Self"),
  /** Base64-encoded image data for delivery photo */
  imageBase64: z.string().optional(),
  /** Base64-encoded signature data */
  signatureBase64: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const parcelsRouter = router({
  /**
   * Create a new parcel. [Part 10.4]
   * Publishes parcel.created event to CORE-2 Event Bus.
   */
  create: protectedProcedure
    .input(createParcelInput)
    .mutation(async ({ ctx, input }) => {
      const trackingNumber = generateTrackingNumber();
      logger.info("Creating parcel", { tenantId: input.tenantId, trackingNumber });

      const parcel = await createParcel({
        tenantId: input.tenantId,
        trackingNumber,
        status: "PENDING",
        priority: input.priority,
        senderName: input.senderName,
        senderPhone: input.senderPhone,
        senderAddress: input.senderAddress,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        recipientAddress: input.recipientAddress,
        recipientCity: input.recipientCity,
        recipientState: input.recipientState,
        description: input.description,
        weightGrams: input.weightGrams,
        deliveryFeeKobo: input.deliveryFeeKobo,
        insuranceValueKobo: input.insuranceValueKobo,
        currency: input.currency,
        createdById: ctx.user.id,
        estimatedDeliveryAt: input.estimatedDeliveryAt,
        clientId: input.clientId,
      });

      // Record initial status update in the immutable event log
      await addParcelUpdate({
        tenantId: input.tenantId,
        parcelId: parcel!.id,
        status: "PENDING",
        notes: "Parcel created and awaiting collection",
        recordedById: ctx.user.id,
      });

      // Publish to CORE-2 Event Bus [Part 5]
      await publishEvent({
        event: "parcel.created",
        tenantId: input.tenantId,
        parcelId: parcel!.id,
        trackingNumber,
        timestamp: new Date().toISOString(),
        data: { priority: input.priority, currency: input.currency },
      });

      return { success: true, data: parcel };
    }),

  /**
   * List parcels for a tenant with pagination. [Part 10.4]
   */
  list: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const items = await listParcels(input.tenantId, input.limit, input.offset);
      return { success: true, data: items };
    }),

  /**
   * Cursor-based paginated list for the parcels list page. [TASK-08]
   * More efficient than offset pagination — no COUNT(*) needed.
   */
  listCursor: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        limit: z.number().int().min(1).max(100).default(30),
        cursor: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const result = await listParcelsCursor(input.tenantId, input.limit, input.cursor);
      return { success: true, data: result.items, nextCursor: result.nextCursor };
    }),

  /**
   * Aggregate stats endpoint for the dashboard. [TASK-07]
   * Uses COUNT GROUP BY — avoids fetching all parcel rows for client-side counting.
   */
  stats: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const data = await getParcelStats(input.tenantId);
      return { success: true, data };
    }),

  /**
   * Search parcels by tracking number fragment. [Part 10.4]
   */
  search: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64), query: z.string().min(1) }))
    .query(async ({ input }) => {
      const items = await searchParcels(input.tenantId, input.query);
      return { success: true, data: items };
    }),

  /**
   * Get a parcel by tracking number (authenticated — staff view). [Part 10.4]
   */
  getByTracking: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64), trackingNumber: z.string().min(1) }))
    .query(async ({ input }) => {
      const parcel = await getParcelByTracking(input.tenantId, input.trackingNumber);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });
      const updates = await getParcelUpdates(input.tenantId, parcel.id);
      const pod = await getProofOfDelivery(input.tenantId, parcel.id);
      return { success: true, data: { parcel, updates, pod } };
    }),

  /**
   * Public customer tracking — no authentication required. [Part 10.4]
   * Returns limited fields for privacy (no sender details).
   */
  trackPublic: publicProcedure
    .input(z.object({ trackingNumber: z.string().min(1).max(32) }))
    .query(async ({ input }) => {
      const parcel = await getParcelByTrackingPublic(input.trackingNumber);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });
      const updates = await getParcelUpdatesPublic(parcel.id);
      // Return only public-safe fields — no sender address, no agent details
      return {
        success: true,
        data: {
          trackingNumber: parcel.trackingNumber,
          status: parcel.status,
          priority: parcel.priority,
          recipientCity: parcel.recipientCity,
          recipientState: parcel.recipientState,
          estimatedDeliveryAt: parcel.estimatedDeliveryAt,
          actualDeliveryAt: parcel.actualDeliveryAt,
          createdAt: parcel.createdAt,
          updates: updates.map(u => ({
            status: u.status,
            location: u.location,
            notes: u.notes,
            createdAt: u.createdAt,
          })),
        },
      };
    }),

  /**
   * Add a status update to a parcel (immutable event log). [Part 10.4]
   * L-06: Triggers OTP generation + Termii SMS when status → OUT_FOR_DELIVERY.
   * Publishes appropriate event to CORE-2 Event Bus.
   */
  addUpdate: protectedProcedure
    .input(addUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

      // L-06: Block DELIVERED transition if OTP has not been verified
      if (input.status === "DELIVERED" && !parcel.otpVerifiedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "OTP must be verified before marking delivery as complete.",
        });
      }

      logger.info("Adding parcel update", {
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        status: input.status,
      });

      // Append to immutable update log
      await addParcelUpdate({
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        status: input.status,
        location: input.location,
        latitude: input.latitude !== undefined ? parseFloat(input.latitude) : null,
        longitude: input.longitude !== undefined ? parseFloat(input.longitude) : null,
        notes: input.notes,
        recordedById: ctx.user.id,
      });

      // Update the parcel's current status
      const extra: Record<string, unknown> = {};
      if (input.status === "DELIVERED") {
        extra.actualDeliveryAt = new Date();
      }
      await updateParcelStatus(input.tenantId, input.parcelId, input.status, extra as any);

      // L-06: Automatically generate and send OTP when rider marks OUT_FOR_DELIVERY
      let otpOfflineToken: string | undefined;
      if (input.status === "OUT_FOR_DELIVERY") {
        const otpCode = generateOtp();
        const otpHash = hashOtp(otpCode);
        const otpExpiresAt = otpExpiryTimestamp();

        await storeParcelOtp(input.tenantId, input.parcelId, otpHash, otpExpiresAt);

        // Send OTP via @webwaka/core Termii provider (non-fatal if SMS fails)
        await sendOtpSms(parcel.recipientPhone, parcel.recipientName, parcel.trackingNumber, otpCode);

        // Pre-compute offline token for the rider's Dexie cache
        otpOfflineToken = buildOfflineToken(input.parcelId, otpCode);

        logger.info("OTP generated for OUT_FOR_DELIVERY", {
          tenantId: input.tenantId,
          parcelId: input.parcelId,
        });
      }

      // Publish event to CORE-2 [Part 5]
      const eventMap: Record<string, string> = {
        COLLECTED: "parcel.collected",
        IN_TRANSIT: "parcel.dispatched",
        OUT_FOR_DELIVERY: "parcel.out_for_delivery",
        DELIVERED: "parcel.delivered",
        FAILED: "parcel.failed",
        RETURNED: "parcel.returned",
      };
      const eventName = eventMap[input.status];
      if (eventName) {
        await publishEvent({
          event: eventName as any,
          tenantId: input.tenantId,
          parcelId: input.parcelId,
          trackingNumber: parcel.trackingNumber,
          timestamp: new Date().toISOString(),
          data: { location: input.location, notes: input.notes },
        });
      }

      return {
        success: true,
        /** L-06: Offline fallback token — rider app caches this in Dexie */
        otpOfflineToken,
      };
    }),

  /**
   * L-06: Request a new OTP to be sent to the recipient.
   * Regenerates the OTP and re-sends the SMS. Rate limiting: must be OUT_FOR_DELIVERY.
   */
  requestOtp: agentProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

      if (parcel.status !== "OUT_FOR_DELIVERY") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OTP can only be requested for parcels that are OUT_FOR_DELIVERY.",
        });
      }

      if (parcel.otpVerifiedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OTP has already been verified for this delivery.",
        });
      }

      const otpCode = generateOtp();
      const otpHash = hashOtp(otpCode);
      const otpExpiresAt = otpExpiryTimestamp();

      await storeParcelOtp(input.tenantId, input.parcelId, otpHash, otpExpiresAt);
      await sendOtpSms(parcel.recipientPhone, parcel.recipientName, parcel.trackingNumber, otpCode);

      const otpOfflineToken = buildOfflineToken(input.parcelId, otpCode);

      logger.info("OTP resent on request", { tenantId: input.tenantId, parcelId: input.parcelId });

      return { success: true, otpOfflineToken };
    }),

  /**
   * L-06: Verify the OTP entered by the rider.
   * Online path: validate against the stored hash in DB.
   * Also accepts an offline token (pre-computed HMAC) for offline verification fallback.
   */
  verifyOtp: agentProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelId: z.number().int().positive(),
        /** 4-digit OTP entered by the rider (as received by customer via SMS) */
        otpCode: z.string().length(4).regex(/^\d{4}$/).optional(),
        /** 12-char offline HMAC token from rider's Dexie cache (offline fallback) */
        offlineToken: z.string().length(12).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!input.otpCode && !input.offlineToken) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Provide either otpCode or offlineToken." });
      }

      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

      if (parcel.otpVerifiedAt) {
        // Idempotent — already verified
        return { success: true, alreadyVerified: true };
      }

      if (parcel.status !== "OUT_FOR_DELIVERY") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OTP verification is only valid when parcel is OUT_FOR_DELIVERY.",
        });
      }

      let verified = false;

      // Online path: verify against the hashed OTP in the database
      if (input.otpCode && parcel.otpCode && parcel.otpExpiresAt) {
        if (isOtpExpired(parcel.otpExpiresAt)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OTP has expired. Please request a new one.",
          });
        }
        verified = verifyOtpHash(input.otpCode, parcel.otpCode);
      }

      // Offline fallback: verify the pre-computed HMAC token
      if (!verified && input.offlineToken && input.otpCode) {
        verified = verifyOfflineToken(input.parcelId, input.otpCode, input.offlineToken);
      }

      if (!verified) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid OTP. Please ask the customer to check their SMS.",
        });
      }

      await markOtpVerified(input.tenantId, input.parcelId);
      logger.info("OTP verified successfully", { tenantId: input.tenantId, parcelId: input.parcelId });

      return { success: true, alreadyVerified: false };
    }),

  /**
   * Dispatch a parcel — assign an agent and move to IN_TRANSIT. [Part 10.4]
   */
  dispatch: agentProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelId: z.number().int().positive(),
        agentId: z.number().int().positive(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

      if (!["PENDING", "COLLECTED"].includes(parcel.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot dispatch a parcel with status ${parcel.status}`,
        });
      }

      await updateParcelStatus(input.tenantId, input.parcelId, "IN_TRANSIT", {
        assignedAgentId: input.agentId,
      });

      await addParcelUpdate({
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        status: "IN_TRANSIT",
        notes: input.notes ?? "Parcel dispatched to delivery agent",
        recordedById: ctx.user.id,
      });

      await publishEvent({
        event: "parcel.dispatched",
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        trackingNumber: parcel.trackingNumber,
        timestamp: new Date().toISOString(),
        data: { agentId: input.agentId },
      });

      return { success: true };
    }),

  /**
   * Submit proof of delivery with optional photo and signature. [Part 10.4]
   * L-06: Requires OTP verification before POD can be submitted.
   * Images stored in S3/R2 via platform storage helpers.
   */
  submitPOD: agentProcedure
    .input(podInput)
    .mutation(async ({ ctx, input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

      // L-06: Enforce OTP verification gate before POD can be submitted
      if (!parcel.otpVerifiedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Delivery OTP must be verified before submitting proof of delivery. Ask the customer for the OTP sent to their phone.",
        });
      }

      logger.info("Submitting proof of delivery", {
        tenantId: input.tenantId,
        parcelId: input.parcelId,
      });

      let imageUrl: string | undefined;
      let imageKey: string | undefined;
      let signatureUrl: string | undefined;
      let signatureKey: string | undefined;

      // Upload delivery photo to S3/R2 [Part 9.2]
      if (input.imageBase64) {
        const imageBuffer = Buffer.from(input.imageBase64, "base64");
        const key = `pod/${input.tenantId}/${input.parcelId}/photo-${Date.now()}.jpg`;
        const result = await storagePut(key, imageBuffer, "image/jpeg");
        imageUrl = result.url;
        imageKey = result.key;
      }

      // Upload signature to S3/R2 [Part 9.2]
      if (input.signatureBase64) {
        const sigBuffer = Buffer.from(input.signatureBase64, "base64");
        const key = `pod/${input.tenantId}/${input.parcelId}/signature-${Date.now()}.png`;
        const result = await storagePut(key, sigBuffer, "image/png");
        signatureUrl = result.url;
        signatureKey = result.key;
      }

      const pod = await createProofOfDelivery({
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        receivedByName: input.receivedByName,
        receivedByRelation: input.receivedByRelation,
        imageUrl,
        imageKey,
        signatureUrl,
        signatureKey,
        capturedById: ctx.user.id,
      });

      // Mark parcel as DELIVERED
      await updateParcelStatus(input.tenantId, input.parcelId, "DELIVERED", {
        actualDeliveryAt: new Date(),
      });

      await addParcelUpdate({
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        status: "DELIVERED",
        notes: `Delivered to ${input.receivedByName} (${input.receivedByRelation})`,
        recordedById: ctx.user.id,
      });

      await publishEvent({
        event: "parcel.delivered",
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        trackingNumber: parcel.trackingNumber,
        timestamp: new Date().toISOString(),
        data: { receivedByName: input.receivedByName, hasPhoto: !!imageUrl, hasSignature: !!signatureUrl },
      });

      return { success: true, data: pod };
    }),

  /**
   * T-LOG-02: Upload a watermarked POD photo to R2 and attach to the POD record.
   * Called by the background sync worker when a photo is pending upload from Dexie.
   * Also called directly when the rider submits POD while online with a pre-watermarked photo.
   * Returns the R2 URL so the caller can update the local Dexie record.
   */
  uploadPodPhoto: agentProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelId: z.number().int().positive(),
        /** Watermarked JPEG as base64 — watermark was burned in client-side */
        imageBase64: z.string().min(1),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        capturedAt: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

      const imageBuffer = Buffer.from(input.imageBase64, "base64");
      const key = `pod/${input.tenantId}/${input.parcelId}/photo-${input.capturedAt}.jpg`;
      const result = await storagePut(key, imageBuffer, "image/jpeg");

      logger.info("T-LOG-02: POD photo uploaded", {
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        key: result.key,
        hasGeo: input.lat !== null && input.lat !== undefined,
      });

      // If a POD record already exists (submitted online), update its imageUrl
      const existingPod = await getProofOfDelivery(input.tenantId, input.parcelId);
      if (existingPod && !existingPod.imageUrl) {
        await updatePodImageUrl(existingPod.id, result.url, result.key);
      }

      return { success: true, imageUrl: result.url };
    }),

  /**
   * Get proof of delivery record. [Part 10.4]
   */
  getPOD: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64), parcelId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const pod = await getProofOfDelivery(input.tenantId, input.parcelId);
      return { success: true, data: pod };
    }),

  /**
   * Soft-delete a parcel. [Part 9.2] — never hard-delete.
   */
  delete: adminProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64), parcelId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await softDeleteParcel(input.tenantId, input.parcelId);
      return { success: true };
    }),

  /**
   * P12-T2: Confirm a parcel for shipment on a specific transport trip.
   * Publishes parcel.seats_required to the transport service and blocks cargo seats.
   * Operators call this when assigning a parcel to a specific trip.
   */
  confirmForTrip: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelId: z.number().int().positive(),
        tripId: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });
      }

      // Link parcel to the transport trip
      await linkParcelToTrip(input.tenantId, input.parcelId, input.tripId);

      logger.info("Parcel linked to transport trip — requesting seat assignment", {
        parcelId: input.parcelId,
        tripId: input.tripId,
        requestedBy: ctx.user.openId,
      });

      // Publish parcel.seats_required to the transport service
      const result = await publishSeatsRequired(input.parcelId, input.tenantId);

      await publishEvent({
        event: "parcel.trip_assigned",
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        trackingNumber: parcel.trackingNumber,
        timestamp: new Date().toISOString(),
        data: { tripId: input.tripId, seatResult: result.outcome },
      });

      if (result.outcome === "unavailable") {
        return {
          success: true,
          seatAssignment: "unavailable" as const,
          message: "Cargo space full on this trip — please reschedule to a different trip",
          available: result.available,
          requested: result.requested,
        };
      }

      if (result.outcome === "pending_retry") {
        return {
          success: true,
          seatAssignment: "pending" as const,
          message: "Seat assignment is pending — will retry on next sync",
        };
      }

      return {
        success: true,
        seatAssignment: "confirmed" as const,
        blockedSeatIds: result.blockedSeatIds,
      };
    }),

  /**
   * Driver App: Get all parcels assigned to the authenticated rider.
   * Returns parcels in all active statuses so the rider can see their full queue.
   */
  myDeliveries: agentProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const items = await listParcelsForAgent(input.tenantId, ctx.user.id);
      return { success: true, data: items };
    }),

  /**
   * POD Vault: List all proof-of-delivery records for a tenant.
   * Joined with parcel info for display purposes.
   */
  listPODs: protectedProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const items = await listPodRecords(input.tenantId, input.limit, input.offset);
      return { success: true, data: items };
    }),
});
