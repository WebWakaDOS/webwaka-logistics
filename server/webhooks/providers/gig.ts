/**
 * GIG Logistics Webhook Handler [P04 — TASK 4]
 * Maps GIG-specific status codes to canonical WebWaka statuses.
 * HMAC-SHA256 signature verification (BUG-04 fix).
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import type { CanonicalDeliveryStatus } from "../../../shared/types";
import { CommerceEvents } from "@webwaka/core";
import { createLogger } from "../../logger";
import { getDeliveryRequestByOrderId, updateDeliveryRequestStatus } from "../../delivery.db";
import { publishCommerceEvent } from "../../events/commerceEventBus";

const logger = createLogger("GIGWebhook");

const GIG_STATUS_MAP: Record<string, CanonicalDeliveryStatus> = {
  SHIPMENT_CREATED: "PENDING",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "FAILED",
  RETURNED_TO_SENDER: "RETURNED",
};

function verifyGigSignature(req: Request): boolean {
  const secret = process.env.GIG_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("[GIG] GIG_WEBHOOK_SECRET not set — skipping verification in dev");
      return true;
    }
    logger.warn("[GIG] GIG_WEBHOOK_SECRET not configured in production — rejecting request");
    return false;
  }

  const signature = req.headers["x-gig-signature"] as string | undefined;
  if (!signature) {
    logger.warn("[GIG] Missing x-gig-signature header");
    return false;
  }

  const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function handleGigWebhook(req: Request, res: Response): Promise<void> {
  if (!verifyGigSignature(req)) {
    logger.warn("[GIG] Invalid or missing webhook signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const orderId = body.orderId as string | undefined;
  const tenantId = body.tenantId as string | undefined;
  const gigStatus = body.status as string | undefined;
  const trackingUrl = body.trackingUrl as string | undefined;
  const estimatedDelivery = body.estimatedDelivery as string | undefined;

  if (!orderId || !tenantId || !gigStatus) {
    logger.warn("[GIG] Webhook missing required fields", { orderId, tenantId, gigStatus });
    res.status(400).json({ error: "orderId, tenantId, and status are required" });
    return;
  }

  const canonicalStatus = GIG_STATUS_MAP[gigStatus];
  if (!canonicalStatus) {
    logger.warn("[GIG] Unknown status code — no-op", { gigStatus });
    res.status(200).json({ ok: true, note: "Unknown status — ignored" });
    return;
  }

  const request = await getDeliveryRequestByOrderId(orderId);
  if (!request) {
    logger.warn("[GIG] Delivery request not found", { orderId });
    res.status(404).json({ error: "Delivery request not found" });
    return;
  }

  await updateDeliveryRequestStatus(orderId, tenantId, canonicalStatus, {
    assignedProvider: "gig",
  });

  await publishCommerceEvent(CommerceEvents.DELIVERY_STATUS, {
    orderId,
    tenantId,
    deliveryId: request.internalDeliveryId ?? orderId,
    provider: "gig",
    status: canonicalStatus,
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(estimatedDelivery ? { estimatedDelivery } : {}),
  });

  logger.info("[GIG] Webhook processed", { orderId, canonicalStatus });
  res.status(200).json({ ok: true });
}
