/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export { PARCEL_STATUS, PARCEL_PRIORITY } from "../drizzle/schema";
export * from "./_core/errors";

// ─────────────────────────────────────────────────────────────────────────────
// Logistics-local type definitions
// These types are not yet exported from @webwaka/core v1.6.1.
// They are defined here per repo-local convention until core is updated.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical delivery status values used across all 3PL provider integrations */
export type CanonicalDeliveryStatus =
  | "PENDING"
  | "PICKING_PROVIDER"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";

/** A delivery address used for provider quote computation */
export interface DeliveryAddress {
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  lga: string;
  [key: string]: unknown;
}

/** A quote from a single delivery provider */
export interface ProviderQuote {
  provider: string;
  providerName: string;
  etaHours: number;
  feeKobo: number;
  trackingSupported: boolean;
}

/** Platform-level event envelope */
export interface PlatformEvent<T = unknown> {
  type: string;
  payload: T;
  publishedAt: string;
}

/** Payload for order.ready_for_delivery events from the commerce repo */
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

/** Payload for delivery.quote events published back to commerce */
export interface DeliveryQuotePayload {
  orderId: string;
  tenantId: string;
  quotes: ProviderQuote[];
  unavailable?: string;
}
