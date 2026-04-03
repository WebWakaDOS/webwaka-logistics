/**
 * Riders tRPC Router [T-LOG-05]
 * Handles gig rider onboarding and KYC state management.
 *
 * NDPR compliance:
 *  - Never store raw license numbers or BVN in the database.
 *  - Document base64 payloads are immediately uploaded to R2; raw bytes never persisted.
 *  - All queries are scoped by tenantId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { createLogger } from "../logger";
import { KycEvents } from "../events/kycTypes";
import type { KycVerificationRequestedPayload } from "../events/kycTypes";
import { publishKycEvent } from "../events/kycEventBus";
import {
  createGuarantor,
  createRider,
  getGuarantorsByRiderId,
  getRiderById,
  getRiderByUserId,
  listRiders,
  updateRiderKycStatus,
} from "../riders.db";
import { RIDER_VEHICLE_TYPE, RIDER_KYC_STATUS } from "../../drizzle/schema";

const logger = createLogger("RidersRouter");

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────────────────────────────────

const guarantorInput = z.object({
  fullName: z.string().min(2).max(128),
  phone: z.string().min(7).max(20),
  address: z.string().min(5).max(256),
  relationship: z.string().min(2).max(64),
  /** Guarantor's government ID — base64 JPEG or PDF (max ~5MB base64) */
  idDocBase64: z.string().min(1).max(7_000_000).optional(),
});

const submitApplicationInput = z.object({
  tenantId: z.string().min(1).max(64),
  fullName: z.string().min(2).max(128),
  phone: z.string().min(7).max(20),
  address: z.string().min(5).max(256),
  state: z.string().min(2).max(64),
  lga: z.string().min(2).max(64),
  vehicleType: z.enum(RIDER_VEHICLE_TYPE),
  plateNumber: z.string().min(4).max(20),
  /** Driver's license document — base64 JPEG or PDF (NDPR: number is never sent/stored) */
  licenseDocBase64: z.string().min(1).max(7_000_000),
  licenseExpiresAt: z.string().datetime().optional(),
  guarantors: z.array(guarantorInput).min(1).max(2),
});

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const ridersRouter = router({
  /**
   * Submit a rider onboarding application.
   * - Uploads license doc and guarantor ID docs to R2.
   * - Inserts rider + guarantors in PENDING state.
   * - Emits kyc.verification_requested to Fintech.
   * - Returns rider record with kycStatus=VERIFYING.
   *
   * Idempotent: if the user already has an application for this tenant, return it.
   */
  submitApplication: protectedProcedure
    .input(submitApplicationInput)
    .mutation(async ({ ctx, input }) => {
      // Idempotency — prevent duplicate submissions
      const existing = await getRiderByUserId(input.tenantId, ctx.user.id);
      if (existing) {
        const guarantorList = await getGuarantorsByRiderId(input.tenantId, existing.id);
        return { rider: existing, guarantors: guarantorList };
      }

      logger.info("Rider application submitted", {
        tenantId: input.tenantId,
        userId: ctx.user.id,
      });

      // ── Upload license document to R2 ─────────────────────────────────────
      const licenseBuffer = Buffer.from(input.licenseDocBase64, "base64");
      const licenseKey = `kyc/${input.tenantId}/riders/${ctx.user.id}/license-${Date.now()}.jpg`;
      const licenseUpload = await storagePut(licenseKey, licenseBuffer, "image/jpeg");

      // ── Insert rider in PENDING state ──────────────────────────────────────
      const rider = await createRider({
        tenantId: input.tenantId,
        userId: ctx.user.id,
        fullName: input.fullName,
        phone: input.phone,
        address: input.address,
        state: input.state,
        lga: input.lga,
        vehicleType: input.vehicleType,
        plateNumber: input.plateNumber,
        licenseDocKey: licenseUpload.key,
        licenseDocUrl: licenseUpload.url,
        licenseExpiresAt: input.licenseExpiresAt ? new Date(input.licenseExpiresAt) : null,
        kycStatus: "PENDING",
        submittedAt: new Date(),
      });

      // ── Upload guarantor ID docs + insert guarantors ───────────────────────
      const guarantorSummaries: KycVerificationRequestedPayload["guarantors"] = [];

      for (const g of input.guarantors) {
        let idDocKey: string | undefined;
        let idDocUrl: string | undefined;

        if (g.idDocBase64) {
          const idBuffer = Buffer.from(g.idDocBase64, "base64");
          const idKey = `kyc/${input.tenantId}/guarantors/${rider.id}/${g.phone}-${Date.now()}.jpg`;
          const idUpload = await storagePut(idKey, idBuffer, "image/jpeg");
          idDocKey = idUpload.key;
          idDocUrl = idUpload.url;
        }

        await createGuarantor({
          tenantId: input.tenantId,
          riderId: rider.id,
          fullName: g.fullName,
          phone: g.phone,
          address: g.address,
          relationship: g.relationship,
          idDocKey: idDocKey ?? null,
          idDocUrl: idDocUrl ?? null,
        });

        guarantorSummaries.push({
          fullName: g.fullName,
          phone: g.phone,
          relationship: g.relationship,
          idDocUrl: idDocUrl ?? "",
        });
      }

      // ── Transition to VERIFYING + emit event ─────────────────────────────
      const kycPayload: KycVerificationRequestedPayload = {
        riderId: rider.id,
        tenantId: input.tenantId,
        fullName: input.fullName,
        phone: input.phone,
        licenseDocUrl: licenseUpload.url,
        guarantors: guarantorSummaries,
      };

      await publishKycEvent(KycEvents.VERIFICATION_REQUESTED, kycPayload);

      const verifyingRider = await updateRiderKycStatus(
        input.tenantId,
        rider.id,
        "VERIFYING",
        { submittedAt: new Date() },
      );

      const guarantorList = await getGuarantorsByRiderId(input.tenantId, rider.id);

      return { rider: verifyingRider, guarantors: guarantorList };
    }),

  /**
   * Get the calling user's own rider application (if any).
   */
  getMyApplication: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const rider = await getRiderByUserId(input.tenantId, ctx.user.id);
      if (!rider) return null;

      const guarantorList = await getGuarantorsByRiderId(input.tenantId, rider.id);
      return { rider, guarantors: guarantorList };
    }),

  /**
   * Admin: list all rider applications for the tenant.
   */
  listApplications: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        kycStatus: z.enum(RIDER_KYC_STATUS).optional(),
      }),
    )
    .query(async ({ input }) => {
      const all = await listRiders(input.tenantId);
      if (input.kycStatus) {
        return all.filter((r) => r.kycStatus === input.kycStatus);
      }
      return all;
    }),

  /**
   * Admin: get a single rider by ID (with guarantors).
   */
  getRider: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        riderId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const rider = await getRiderById(input.tenantId, input.riderId);
      if (!rider) throw new TRPCError({ code: "NOT_FOUND", message: "Rider not found" });
      const guarantorList = await getGuarantorsByRiderId(input.tenantId, input.riderId);
      return { rider, guarantors: guarantorList };
    }),

  /**
   * Admin: re-trigger KYC for a stuck application.
   * Allowed transitions: PENDING → VERIFYING or REJECTED → VERIFYING.
   */
  retriggerKyc: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        riderId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      const rider = await getRiderById(input.tenantId, input.riderId);
      if (!rider) throw new TRPCError({ code: "NOT_FOUND", message: "Rider not found" });

      if (rider.kycStatus === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Rider is already ACTIVE — no re-trigger needed",
        });
      }

      if (rider.kycStatus === "VERIFYING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "KYC verification is already in progress",
        });
      }

      const guarantorList = await getGuarantorsByRiderId(input.tenantId, input.riderId);

      const kycPayload: KycVerificationRequestedPayload = {
        riderId: rider.id,
        tenantId: input.tenantId,
        fullName: rider.fullName,
        phone: rider.phone,
        licenseDocUrl: rider.licenseDocUrl ?? "",
        guarantors: guarantorList.map((g) => ({
          fullName: g.fullName,
          phone: g.phone,
          relationship: g.relationship,
          idDocUrl: g.idDocUrl ?? "",
        })),
      };

      await publishKycEvent(KycEvents.VERIFICATION_REQUESTED, kycPayload);

      const updated = await updateRiderKycStatus(input.tenantId, input.riderId, "VERIFYING", {
        rejectionReason: undefined,
      });

      logger.info("Admin re-triggered KYC", { tenantId: input.tenantId, riderId: input.riderId });

      return { rider: updated };
    }),
});
