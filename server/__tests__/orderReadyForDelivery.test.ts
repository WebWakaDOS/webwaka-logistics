/**
 * Unit Tests: order.ready_for_delivery handler [P04]
 * Verifies: delivery_request created + delivery.quote published on valid event.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommerceEvents } from "@webwaka/core";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../delivery.db", () => ({
  createDeliveryRequest: vi.fn().mockResolvedValue({
    id: 1,
    orderId: "ORDER-001",
    tenantId: "TENANT-ABC",
    internalDeliveryId: "DR-TESTID001",
    status: "PICKING_PROVIDER",
  }),
  getDeliveryRequestByOrderId: vi.fn().mockResolvedValue(null),
}));

vi.mock("../events/commerceEventBus", () => ({
  publishCommerceEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../providers/index", () => ({
  getProviderQuotes: vi.fn().mockReturnValue([
    {
      provider: "gig",
      providerName: "GIG Logistics",
      etaHours: 48,
      feeKobo: 350000,
      trackingSupported: true,
    },
    {
      provider: "sendbox",
      providerName: "Sendbox",
      etaHours: 72,
      feeKobo: 418000,
      trackingSupported: true,
    },
  ]),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { handleOrderReadyForDelivery } from "../events/orderReadyForDelivery";
import {
  createDeliveryRequest,
  getDeliveryRequestByOrderId,
} from "../delivery.db";
import { publishCommerceEvent } from "../events/commerceEventBus";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const validPayload = {
  orderId: "ORDER-001",
  tenantId: "TENANT-ABC",
  sourceModule: "single-vendor" as const,
  pickupAddress: {
    name: "Waka Seller",
    phone: "08012345678",
    street: "12 Broad Street",
    city: "Lagos",
    state: "Lagos",
    lga: "Lagos Island",
  },
  deliveryAddress: {
    name: "Ade Buyer",
    phone: "08098765432",
    street: "45 Aminu Kano",
    city: "Kano",
    state: "Kano",
    lga: "Nassarawa",
  },
  itemsSummary: "1x Phone Case, 2x Earphones",
  weightKg: 0.8,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOrderReadyForDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing record (fresh order)
    vi.mocked(getDeliveryRequestByOrderId).mockResolvedValue(null);
  });

  it("creates a delivery_request on a valid event", async () => {
    await handleOrderReadyForDelivery(validPayload);
    expect(createDeliveryRequest).toHaveBeenCalledOnce();
    const call = vi.mocked(createDeliveryRequest).mock.calls[0][0];
    expect(call.orderId).toBe("ORDER-001");
    expect(call.tenantId).toBe("TENANT-ABC");
    expect(call.sourceModule).toBe("single-vendor");
    expect(call.status).toBe("PICKING_PROVIDER");
  });

  it("publishes a delivery.quote event after creating the request", async () => {
    await handleOrderReadyForDelivery(validPayload);
    expect(publishCommerceEvent).toHaveBeenCalledOnce();
    const [eventType, payload] = vi.mocked(publishCommerceEvent).mock.calls[0];
    expect(eventType).toBe(CommerceEvents.DELIVERY_QUOTE);
    expect(payload.orderId).toBe("ORDER-001");
    expect(payload.tenantId).toBe("TENANT-ABC");
    expect(Array.isArray(payload.quotes)).toBe(true);
    expect(payload.quotes.length).toBeGreaterThan(0);
  });

  it("is idempotent — duplicate orderId is acked without processing", async () => {
    vi.mocked(getDeliveryRequestByOrderId).mockResolvedValue({
      id: 1,
      orderId: "ORDER-001",
      tenantId: "TENANT-ABC",
      status: "PICKING_PROVIDER",
    } as any);

    await handleOrderReadyForDelivery(validPayload);

    expect(createDeliveryRequest).not.toHaveBeenCalled();
    expect(publishCommerceEvent).not.toHaveBeenCalled();
  });

  it("acks without retry on invalid payload (missing orderId)", async () => {
    const bad = { ...validPayload, orderId: "" };
    await handleOrderReadyForDelivery(bad);
    expect(createDeliveryRequest).not.toHaveBeenCalled();
    expect(publishCommerceEvent).not.toHaveBeenCalled();
  });

  it("acks without retry on invalid payload (missing tenantId)", async () => {
    const bad = { ...validPayload, tenantId: "" };
    await handleOrderReadyForDelivery(bad);
    expect(createDeliveryRequest).not.toHaveBeenCalled();
  });

  it("acks without retry on invalid payload (bad sourceModule)", async () => {
    const bad = { ...validPayload, sourceModule: "unknown-module" };
    await handleOrderReadyForDelivery(bad);
    expect(createDeliveryRequest).not.toHaveBeenCalled();
  });

  it("acks without retry on invalid payload (missing pickup address field)", async () => {
    const bad = {
      ...validPayload,
      pickupAddress: { ...validPayload.pickupAddress, city: "" },
    };
    await handleOrderReadyForDelivery(bad);
    expect(createDeliveryRequest).not.toHaveBeenCalled();
  });

  it("includes unavailable reason when no providers are available", async () => {
    const { getProviderQuotes } = await import("../providers/index");
    vi.mocked(getProviderQuotes).mockReturnValueOnce([]);

    await handleOrderReadyForDelivery(validPayload);

    const [, payload] = vi.mocked(publishCommerceEvent).mock.calls[0];
    expect(payload.quotes).toHaveLength(0);
    expect(payload.unavailable).toBeDefined();
  });
});
