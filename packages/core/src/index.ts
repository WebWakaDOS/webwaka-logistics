/**
 * @webwaka/core v1.4.0
 * Shared event contracts and platform services for the WebWaka platform.
 * Event type strings are the single source of truth — never hardcode them.
 */

export * from "./sms";

// ─────────────────────────────────────────────────────────────────────────────
// Commerce Event Type Constants
// ─────────────────────────────────────────────────────────────────────────────

export const CommerceEvents = {
  ORDER_READY_DELIVERY: "order.ready_for_delivery",
  DELIVERY_QUOTE: "delivery.quote",
  DELIVERY_STATUS: "delivery.status_changed",
} as const;

export type CommerceEventType =
  (typeof CommerceEvents)[keyof typeof CommerceEvents];

// ─────────────────────────────────────────────────────────────────────────────
// KYC Event Type Constants  [T-LOG-05]
// ─────────────────────────────────────────────────────────────────────────────

export const KycEvents = {
  /** Logistics → Fintech: rider identity documents submitted, requesting verification */
  VERIFICATION_REQUESTED: "kyc.verification_requested",
  /** Fintech → Logistics: identity check completed with approved/rejected result */
  VERIFICATION_COMPLETED: "kyc.verification_completed",
} as const;

export type KycEventType = (typeof KycEvents)[keyof typeof KycEvents];

// ─────────────────────────────────────────────────────────────────────────────
// Address schema (shared between ORDER_READY_DELIVERY and DELIVERY_QUOTE)
// ─────────────────────────────────────────────────────────────────────────────

export interface DeliveryAddress {
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  lga: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbound payload: ORDER_READY_DELIVERY
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderReadyForDeliveryPayload {
  orderId: string;
  tenantId: string;
  sourceModule: "single-vendor" | "multi-vendor";
  vendorId?: string;
  pickupAddress: DeliveryAddress;
  deliveryAddress: DeliveryAddress;
  itemsSummary: string;
  weightKg?: number;
  preferredProviders?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbound payload: DELIVERY_QUOTE
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderQuote {
  provider: string;
  providerName: string;
  etaHours: number;
  feeKobo: number;
  trackingSupported: boolean;
}

export interface DeliveryQuotePayload {
  orderId: string;
  tenantId: string;
  quotes: ProviderQuote[];
  unavailable?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbound payload: DELIVERY_STATUS
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalDeliveryStatus =
  | "PENDING"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";

export interface DeliveryStatusPayload {
  orderId: string;
  tenantId: string;
  deliveryId: string;
  provider: string;
  status: CanonicalDeliveryStatus;
  trackingUrl?: string;
  estimatedDelivery?: string;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC Payloads  [T-LOG-05]
// ─────────────────────────────────────────────────────────────────────────────

export interface KycGuarantorSummary {
  fullName: string;
  phone: string;
  relationship: string;
  /** Signed R2 URL — expires 7 days after issuance */
  idDocUrl: string;
}

/**
 * Outbound: Logistics → Fintech.
 * Emitted when a rider submits their onboarding form.
 * NDPR compliance: no raw license number, no BVN — only signed R2 document URLs.
 */
export interface KycVerificationRequestedPayload {
  riderId: number;
  tenantId: string;
  fullName: string;
  phone: string;
  /** Signed R2 URL to the uploaded driver's license document — expires 7 days */
  licenseDocUrl: string;
  guarantors: KycGuarantorSummary[];
}

/**
 * Inbound: Fintech → Logistics.
 * Consumed by the KYC webhook to update rider status.
 */
export interface KycVerificationCompletedPayload {
  riderId: number;
  tenantId: string;
  status: "approved" | "rejected";
  /** Human-readable reason provided only when status is "rejected" */
  reason?: string;
  verifiedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic platform event envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformEvent<T = unknown> {
  /** Accepts both CommerceEventType and KycEventType */
  type: string;
  payload: T;
  publishedAt: string;
}
