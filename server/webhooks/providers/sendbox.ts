/**
 * Sendbox Webhook Handler [P04 — TASK 4]
 * Maps Sendbox-specific status codes to canonical WebWaka statuses.
 * HMAC-SHA256 signature verification (BUG-07 fix).
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import type { CanonicalDeliveryStatus } from "../../../shared/types";
import { CommerceEvents } from "@webwaka/core";
import { createLogger } from "../../logger";
import { getDeliveryRequestByOrderId, updateDeliveryRequestStatus } from "../../delivery.db";
import { publishCommerceEvent } from "../../events/commerceEventBus";

const logger = createLogger("SendboxWebhook");

const SENDBOX_STATUS_MAP: Record<string, CanonicalDeliveryStatus> = {
  SHIPMENT_CREATED: "PENDING",
  PROCESSING: "PENDING",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DELIVERY_ATTEMPTED: "FAILED",
  RETURNED: "RETURNED",
};

function verifySendboxSignature(req: Request): boolean {
  const secret = process.env.SENDBOX_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("[Sendbox] SENDBOX_WEBHOOK_SECRET not set — skipping verification in dev");
      return true;
    }
    logger.warn("[Sendbox] SENDBOX_WEBHOOK_SECRET not configured in production — rejecting request");
    return false;
  }

  const signature = req.headers["x-sendbox-webhook-secret"] as string | undefined;
  if (!signature) {
    logger.warn("[Sendbox] Missing x-sendbox-webhook-secret header");
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

export async function handleSendboxWebhook(req: Request, res: Response): Promise<void> {
  if (!verifySendboxSignature(req)) {
    logger.warn("[Sendbox] Invalid or missing webhook signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const orderId = body.orderId as string | undefined;
  const tenantId = body.tenantId as string | undefined;
  const sendboxStatus = body.status as string | undefined;
  const trackingUrl = body.tracking_url as string | undefined;
  const estimatedDelivery = body.estimated_delivery as string | undefined;
  const notes = body.notes as string | undefined;

  if (!orderId || !tenantId || !sendboxStatus) {
    logger.warn("[Sendbox] Webhook missing required fields", { orderId, tenantId, sendboxStatus });
    res.status(400).json({ error: "orderId, tenantId, and status are required" });
    return;
  }

  const canonicalStatus = SENDBOX_STATUS_MAP[sendboxStatus];
  if (!canonicalStatus) {
    logger.warn("[Sendbox] Unknown status code — no-op", { sendboxStatus });
    res.status(200).json({ ok: true, note: "Unknown status — ignored" });
    return;
  }

  const request = await getDeliveryRequestByOrderId(orderId);
  if (!request) {
    logger.warn("[Sendbox] Delivery request not found", { orderId });
    res.status(404).json({ error: "Delivery request not found" });
    return;
  }

  await updateDeliveryRequestStatus(orderId, tenantId, canonicalStatus, {
    assignedProvider: "sendbox",
  });

  await publishCommerceEvent(CommerceEvents.DELIVERY_STATUS, {
    orderId,
    tenantId,
    deliveryId: request.internalDeliveryId ?? orderId,
    provider: "sendbox",
    status: canonicalStatus,
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(estimatedDelivery ? { estimatedDelivery } : {}),
    ...(notes ? { notes } : {}),
  });

  logger.info("[Sendbox] Webhook processed", { orderId, canonicalStatus });
  res.status(200).json({ ok: true });
}
