/**
 * KYC Event Type Constants — T-LOG-05
 *
 * Defined locally in the Logistics repo until upstreamed to @webwaka/core.
 * The installed @webwaka/core v1.5.0 has domain event infrastructure via
 * WebWakaEventType but does not yet expose the rider KYC event bus contract.
 *
 * Event type strings are the single source of truth — never hardcode them.
 */

export const KycEvents = {
  /** Logistics → Fintech: rider identity documents submitted, requesting verification */
  VERIFICATION_REQUESTED: "kyc.verification_requested",
  /** Fintech → Logistics: identity check completed with approved/rejected result */
  VERIFICATION_COMPLETED: "kyc.verification_completed",
} as const;

export type KycEventType = (typeof KycEvents)[keyof typeof KycEvents];

export interface KycGuarantorSummary {
  fullName: string;
  phone: string;
  relationship: string;
  /** Signed R2 URL — expires 7 days after issuance */
  idDocUrl: string;
}

/**
 * Outbound: Logistics → Fintech.
 * NDPR compliance: no raw license number, no BVN — only signed R2 document URLs.
 */
export interface KycVerificationRequestedPayload {
  riderId: number;
  tenantId: string;
  fullName: string;
  phone: string;
  /** Signed R2 URL to the uploaded driver's license document */
  licenseDocUrl: string;
  guarantors: KycGuarantorSummary[];
}

/**
 * Inbound: Fintech → Logistics webhook payload.
 */
export interface KycVerificationCompletedPayload {
  riderId: number;
  tenantId: string;
  status: "approved" | "rejected";
  /** Human-readable reason provided only when status is "rejected" */
  reason?: string;
  verifiedAt: string;
}

/** Generic platform event envelope for KYC events */
export interface KycPlatformEvent<T = unknown> {
  type: KycEventType;
  payload: T;
  publishedAt: string;
}
