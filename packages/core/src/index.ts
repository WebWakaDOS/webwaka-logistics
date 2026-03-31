/**
 * @webwaka/core v1.2.0
 * Shared event contracts for the WebWaka platform.
 * Event type strings are the single source of truth — never hardcode them.
 */

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
// Generic platform event envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformEvent<T = unknown> {
  type: CommerceEventType;
  payload: T;
  publishedAt: string;
}
