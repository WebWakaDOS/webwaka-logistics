/**
 * Integration Test: order.ready_for_delivery → delivery.quote [P04]
 * Verifies end-to-end flow within the 10-second SLA using real in-memory SQLite.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { CommerceEvents } from "@webwaka/core";

// ─────────────────────────────────────────────────────────────────────────────
// Use real DB module but redirect to an in-memory database
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("../../drizzle/schema");

  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS delivery_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId TEXT NOT NULL UNIQUE,
      tenantId TEXT NOT NULL,
      sourceModule TEXT NOT NULL,
      vendorId TEXT,
      pickupAddress TEXT NOT NULL,
      deliveryAddress TEXT NOT NULL,
      itemsSummary TEXT NOT NULL,
      weightKg REAL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      assignedProvider TEXT,
      internalDeliveryId TEXT,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const db = drizzle(sqlite, { schema });
  return { getDb: () => db };
});

// Mock only the event publisher (no real HTTP in tests)
const publishedEvents: Array<{ type: string; payload: unknown }> = [];

vi.mock("../events/commerceEventBus", () => ({
  publishCommerceEvent: vi.fn().mockImplementation(
    async (type: string, payload: unknown) => {
      publishedEvents.push({ type, payload });
    }
  ),
}));

import { handleOrderReadyForDelivery } from "../events/orderReadyForDelivery";
import { getDeliveryRequestByOrderId } from "../delivery.db";

// ─────────────────────────────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: order.ready_for_delivery → delivery.quote", () => {
  beforeAll(() => {
    publishedEvents.length = 0;
  });

  it("processes event end-to-end and publishes delivery.quote within 10 seconds", async () => {
    const orderId = `ORDER-INTTEST-${Date.now()}`;
    const start = Date.now();

    await handleOrderReadyForDelivery({
      orderId,
      tenantId: "TENANT-INTEGRATION",
      sourceModule: "single-vendor",
      pickupAddress: {
        name: "Shop Owner",
        phone: "08011111111",
        street: "1 Broad St",
        city: "Lagos",
        state: "Lagos",
        lga: "Lagos Island",
      },
      deliveryAddress: {
        name: "Customer A",
        phone: "08022222222",
        street: "22 Wuse Zone 3",
        city: "Abuja",
        state: "FCT",
        lga: "Municipal",
      },
      itemsSummary: "1x Laptop",
      weightKg: 2.5,
    });

    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(10000);

    // delivery_request must exist in DB
    const request = await getDeliveryRequestByOrderId(orderId);
    expect(request).not.toBeNull();
    expect(request!.orderId).toBe(orderId);
    expect(request!.tenantId).toBe("TENANT-INTEGRATION");
    expect(request!.status).toBe("PICKING_PROVIDER");

    // delivery.quote must have been published
    const quoteEvent = publishedEvents.find(
      (e) => e.type === CommerceEvents.DELIVERY_QUOTE
    );
    expect(quoteEvent).toBeDefined();
    const payload = quoteEvent!.payload as any;
    expect(payload.orderId).toBe(orderId);
    expect(payload.tenantId).toBe("TENANT-INTEGRATION");
    expect(Array.isArray(payload.quotes)).toBe(true);
  });

  it("does not create a second request for the same orderId (idempotency)", async () => {
    const orderId = `ORDER-IDEMPOTENT-${Date.now()}`;
    publishedEvents.length = 0;

    const payload = {
      orderId,
      tenantId: "TENANT-INTEGRATION",
      sourceModule: "single-vendor" as const,
      pickupAddress: {
        name: "S",
        phone: "0801",
        street: "1 St",
        city: "Lagos",
        state: "Lagos",
        lga: "LI",
      },
      deliveryAddress: {
        name: "D",
        phone: "0802",
        street: "2 St",
        city: "Lagos",
        state: "Lagos",
        lga: "LI",
      },
      itemsSummary: "Shoes",
      weightKg: 0.5,
    };

    await handleOrderReadyForDelivery(payload);
    const firstPublishCount = publishedEvents.length;

    // Second call — must be a no-op
    await handleOrderReadyForDelivery(payload);
    expect(publishedEvents.length).toBe(firstPublishCount);
  });
});
