/**
 * Unit Tests: GIG Logistics Webhook Handler [P04]
 * Verifies: canonical status mapping + delivery.status_changed published.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { CommerceEvents } from "@webwaka/core";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../delivery.db", () => ({
  getDeliveryRequestByOrderId: vi.fn().mockResolvedValue({
    id: 1,
    orderId: "ORDER-001",
    tenantId: "TENANT-ABC",
    internalDeliveryId: "DR-TESTID001",
    assignedProvider: "gig",
    status: "IN_TRANSIT",
  }),
  updateDeliveryRequestStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../events/commerceEventBus", () => ({
  publishCommerceEvent: vi.fn().mockResolvedValue(undefined),
}));

import { handleGigWebhook } from "../webhooks/providers/gig";
import { updateDeliveryRequestStatus } from "../delivery.db";
import { publishCommerceEvent } from "../events/commerceEventBus";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReqRes(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = { body, headers } as unknown as Request;
  const resData: { status?: number; body?: unknown } = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((b) => {
      resData.body = b;
      return res;
    }),
    headersSent: false,
  } as unknown as Response;
  return { req, res, resData };
}

// ─────────────────────────────────────────────────────────────────────────────
// GIG status → canonical mapping table
// ─────────────────────────────────────────────────────────────────────────────

const GIG_TO_CANONICAL: Array<[string, string]> = [
  ["SHIPMENT_CREATED", "PENDING"],
  ["PICKED_UP", "PICKED_UP"],
  ["IN_TRANSIT", "IN_TRANSIT"],
  ["OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY"],
  ["DELIVERED", "DELIVERED"],
  ["DELIVERY_FAILED", "FAILED"],
  ["RETURNED_TO_SENDER", "RETURNED"],
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("handleGigWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GIG_WEBHOOK_SECRET;
  });

  it.each(GIG_TO_CANONICAL)(
    "maps GIG status '%s' to canonical '%s' and publishes DELIVERY_STATUS",
    async (gigStatus, expectedCanonical) => {
      const { req, res } = makeReqRes({
        orderId: "ORDER-001",
        tenantId: "TENANT-ABC",
        status: gigStatus,
      });

      await handleGigWebhook(req, res);

      expect(updateDeliveryRequestStatus).toHaveBeenCalledOnce();
      const [, , canonicalStatus] = vi.mocked(updateDeliveryRequestStatus).mock.calls[0];
      expect(canonicalStatus).toBe(expectedCanonical);

      expect(publishCommerceEvent).toHaveBeenCalledOnce();
      const [eventType, payload] = vi.mocked(publishCommerceEvent).mock.calls[0];
      expect(eventType).toBe(CommerceEvents.DELIVERY_STATUS);
      expect(payload.status).toBe(expectedCanonical);
      expect(payload.provider).toBe("gig");
      expect(payload.orderId).toBe("ORDER-001");
      expect(payload.tenantId).toBe("TENANT-ABC");
    }
  );

  it("returns 401 when signature verification fails", async () => {
    process.env.GIG_WEBHOOK_SECRET = "correct-secret";
    const { req, res } = makeReqRes(
      { orderId: "ORDER-001", tenantId: "TENANT-ABC", status: "DELIVERED" },
      { "x-gig-signature": "wrong-secret" }
    );

    await handleGigWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(publishCommerceEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const { req, res } = makeReqRes({ orderId: "ORDER-001" });
    await handleGigWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(publishCommerceEvent).not.toHaveBeenCalled();
  });

  it("returns 200 with no-op for unknown GIG status", async () => {
    const { req, res } = makeReqRes({
      orderId: "ORDER-001",
      tenantId: "TENANT-ABC",
      status: "UNKNOWN_STATUS",
    });
    await handleGigWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(publishCommerceEvent).not.toHaveBeenCalled();
  });

  it("includes trackingUrl in DELIVERY_STATUS payload when provided", async () => {
    const { req, res } = makeReqRes({
      orderId: "ORDER-001",
      tenantId: "TENANT-ABC",
      status: "IN_TRANSIT",
      trackingUrl: "https://gig.track/123",
    });

    await handleGigWebhook(req, res);

    const [, payload] = vi.mocked(publishCommerceEvent).mock.calls[0];
    expect(payload.trackingUrl).toBe("https://gig.track/123");
  });
});
