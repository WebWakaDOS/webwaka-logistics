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
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { createLogger } from "../logger";
import { publishEvent } from "../eventBus";
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
  getProofOfDelivery,
  listParcels,
  searchParcels,
  softDeleteParcel,
  updateParcelStatus,
} from "../parcels.db";

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
   * Publishes appropriate event to CORE-2 Event Bus.
   */
  addUpdate: protectedProcedure
    .input(addUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

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

      return { success: true };
    }),

  /**
   * Dispatch a parcel — assign an agent and move to IN_TRANSIT. [Part 10.4]
   */
  dispatch: protectedProcedure
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
   * Images stored in S3/R2 via platform storage helpers.
   */
  submitPOD: protectedProcedure
    .input(podInput)
    .mutation(async ({ ctx, input }) => {
      const parcel = await getParcelById(input.tenantId, input.parcelId);
      if (!parcel) throw new TRPCError({ code: "NOT_FOUND", message: "Parcel not found" });

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
  delete: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64), parcelId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await softDeleteParcel(input.tenantId, input.parcelId);
      return { success: true };
    }),
});
