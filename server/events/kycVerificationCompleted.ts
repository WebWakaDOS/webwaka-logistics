/**
 * Inbound Event Handler: kyc.verification_completed [T-LOG-05]
 * Consumes the webhook from the Fintech repo and transitions the rider's KYC state.
 *
 * State transitions:
 *   VERIFYING → ACTIVE   (status === "approved")
 *   VERIFYING → REJECTED (status === "rejected")
 *
 * Governance: idempotent, tenant-isolated, validates all required fields.
 */

import { KycEvents, KycVerificationCompletedPayload } from "./kycTypes";
import { createLogger } from "../logger";
import { getRiderById, updateRiderKycStatus } from "../riders.db";

const logger = createLogger("KycVerificationCompleted");

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validatePayload(raw: unknown):
  | { valid: true; payload: KycVerificationCompletedPayload }
  | { valid: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, reason: "Payload must be an object" };
  }
  const p = raw as Record<string, unknown>;

  if (typeof p.riderId !== "number" || !Number.isInteger(p.riderId) || p.riderId <= 0) {
    return { valid: false, reason: "riderId must be a positive integer" };
  }
  if (typeof p.tenantId !== "string" || p.tenantId.trim().length === 0) {
    return { valid: false, reason: "tenantId is required" };
  }
  if (p.status !== "approved" && p.status !== "rejected") {
    return { valid: false, reason: "status must be 'approved' or 'rejected'" };
  }
  if (typeof p.verifiedAt !== "string" || isNaN(Date.parse(p.verifiedAt as string))) {
    return { valid: false, reason: "verifiedAt must be an ISO 8601 timestamp string" };
  }

  return {
    valid: true,
    payload: {
      riderId: p.riderId as number,
      tenantId: p.tenantId as string,
      status: p.status as "approved" | "rejected",
      reason: typeof p.reason === "string" ? p.reason : undefined,
      verifiedAt: p.verifiedAt as string,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the kyc.verification_completed event.
 *
 * Idempotent: if the rider is already ACTIVE or REJECTED, skip processing.
 */
export async function handleKycVerificationCompleted(raw: unknown): Promise<void> {
  const validation = validatePayload(raw);

  if (!validation.valid) {
    logger.warn(
      `[${KycEvents.VERIFICATION_COMPLETED}] Invalid payload — acking without retry`,
      { reason: validation.reason },
    );
    return;
  }

  const { riderId, tenantId, status, reason, verifiedAt } = validation.payload;

  logger.info(`[${KycEvents.VERIFICATION_COMPLETED}] Received`, {
    riderId,
    tenantId,
    status,
  });

  const rider = await getRiderById(tenantId, riderId);
  if (!rider) {
    logger.warn(`[${KycEvents.VERIFICATION_COMPLETED}] Rider not found — skipping`, {
      riderId,
      tenantId,
    });
    return;
  }

  // Idempotency: skip if already in a terminal state
  if (rider.kycStatus === "ACTIVE" || rider.kycStatus === "REJECTED") {
    logger.info(
      `[${KycEvents.VERIFICATION_COMPLETED}] Rider already in terminal state — skipping`,
      { riderId, tenantId, kycStatus: rider.kycStatus },
    );
    return;
  }

  const newStatus = status === "approved" ? "ACTIVE" : "REJECTED";
  const verifiedAtDate = new Date(verifiedAt);

  await updateRiderKycStatus(tenantId, riderId, newStatus, {
    rejectionReason: status === "rejected" ? reason : undefined,
    verifiedAt: verifiedAtDate,
  });

  logger.info(`[${KycEvents.VERIFICATION_COMPLETED}] Rider KYC state updated`, {
    riderId,
    tenantId,
    newStatus,
  });
}
