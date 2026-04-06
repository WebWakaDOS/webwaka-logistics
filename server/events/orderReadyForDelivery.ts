/**
 * Inbound Event Handler: order.ready_for_delivery [P04 — TASK 2]
 * Governance: idempotent, tenant-isolated, validates all required fields.
 */

import { CommerceEvents } from "@webwaka/core";
import type { OrderReadyForDeliveryPayload, DeliveryQuotePayload } from "../../shared/types";
import { createLogger } from "../logger";
import { createDeliveryRequest, getDeliveryRequestByOrderId } from "../delivery.db";
import { publishCommerceEvent } from "./commerceEventBus";
import { getProviderQuotes } from "../providers/index";

const logger = createLogger("OrderReadyHandler");

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateAddress(addr: unknown): addr is OrderReadyForDeliveryPayload["pickupAddress"] {
  if (!addr || typeof addr !== "object") return false;
  const a = addr as Record<string, unknown>;
  return (
    isNonEmpty(a.name) &&
    isNonEmpty(a.phone) &&
    isNonEmpty(a.street) &&
    isNonEmpty(a.city) &&
    isNonEmpty(a.state) &&
    isNonEmpty(a.lga)
  );
}

function validatePayload(raw: unknown): {
  valid: true;
  payload: OrderReadyForDeliveryPayload;
} | { valid: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, reason: "Payload must be an object" };
  }

  const p = raw as Record<string, unknown>;

  if (!isNonEmpty(p.orderId)) return { valid: false, reason: "orderId is required" };
  if (!isNonEmpty(p.tenantId)) return { valid: false, reason: "tenantId is required" };
  if (p.sourceModule !== "single-vendor" && p.sourceModule !== "multi-vendor") {
    return { valid: false, reason: "sourceModule must be 'single-vendor' or 'multi-vendor'" };
  }
  if (!validateAddress(p.pickupAddress)) {
    return { valid: false, reason: "pickupAddress is invalid or incomplete" };
  }
  if (!validateAddress(p.deliveryAddress)) {
    return { valid: false, reason: "deliveryAddress is invalid or incomplete" };
  }
  if (!isNonEmpty(p.itemsSummary)) return { valid: false, reason: "itemsSummary is required" };

  return {
    valid: true,
    payload: {
      orderId: p.orderId as string,
      tenantId: p.tenantId as string,
      sourceModule: p.sourceModule as "single-vendor" | "multi-vendor",
      vendorId: typeof p.vendorId === "string" ? p.vendorId : undefined,
      pickupAddress: p.pickupAddress as OrderReadyForDeliveryPayload["pickupAddress"],
      deliveryAddress: p.deliveryAddress as OrderReadyForDeliveryPayload["deliveryAddress"],
      itemsSummary: p.itemsSummary as string,
      weightKg: typeof p.weightKg === "number" ? p.weightKg : undefined,
      preferredProviders: Array.isArray(p.preferredProviders)
        ? (p.preferredProviders as string[])
        : undefined,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the order.ready_for_delivery event.
 *
 * Idempotent: duplicate orderId → ack without processing.
 * Must publish delivery.quote within 10 seconds.
 */
export async function handleOrderReadyForDelivery(raw: unknown): Promise<void> {
  const validation = validatePayload(raw);

  if (!validation.valid) {
    logger.warn(`[${CommerceEvents.ORDER_READY_DELIVERY}] Invalid payload — acking without retry`, {
      reason: validation.reason,
    });
    return;
  }

  const payload = validation.payload;

  logger.info(`[${CommerceEvents.ORDER_READY_DELIVERY}] Received`, {
    orderId: payload.orderId,
    tenantId: payload.tenantId,
  });

  // Idempotency check
  const existing = await getDeliveryRequestByOrderId(payload.orderId);
  if (existing) {
    logger.info(`[${CommerceEvents.ORDER_READY_DELIVERY}] Duplicate orderId — skipping`, {
      orderId: payload.orderId,
    });
    return;
  }

  // Insert delivery request
  const request = await createDeliveryRequest({
    orderId: payload.orderId,
    tenantId: payload.tenantId,
    sourceModule: payload.sourceModule,
    vendorId: payload.vendorId ?? null,
    pickupAddress: JSON.stringify(payload.pickupAddress),
    deliveryAddress: JSON.stringify(payload.deliveryAddress),
    itemsSummary: payload.itemsSummary,
    weightKg: payload.weightKg ?? null,
    status: "PICKING_PROVIDER",
  });

  // Compute provider quotes
  const weightKg = payload.weightKg ?? 0.5;
  const quotes = getProviderQuotes(
    payload.pickupAddress,
    payload.deliveryAddress,
    weightKg,
    payload.preferredProviders
  );

  const quotePayload: DeliveryQuotePayload = {
    orderId: payload.orderId,
    tenantId: payload.tenantId,
    quotes,
    ...(quotes.length === 0
      ? { unavailable: "No active providers available for this route" }
      : {}),
  };

  logger.info(`[${CommerceEvents.ORDER_READY_DELIVERY}] Publishing delivery.quote`, {
    orderId: payload.orderId,
    quoteCount: quotes.length,
    deliveryId: request.internalDeliveryId,
  });

  await publishCommerceEvent(CommerceEvents.DELIVERY_QUOTE, quotePayload);
}
