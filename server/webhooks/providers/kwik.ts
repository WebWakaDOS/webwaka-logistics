/**
 * Kwik Delivery Webhook Handler [P04 — TASK 4]
 * Maps Kwik-specific status codes to canonical WebWaka statuses.
 * HMAC-SHA256 signature verification (BUG-07 fix).
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import type { CanonicalDeliveryStatus } from "../../../shared/types";
import { CommerceEvents } from "@webwaka/core";
import { createLogger } from "../../logger";
import { getDeliveryRequestByOrderId, updateDeliveryRequestStatus } from "../../delivery.db";
import { publishCommerceEvent } from "../../events/commerceEventBus";

const logger = createLogger("KwikWebhook");

const KWIK_STATUS_MAP: Record<string, CanonicalDeliveryStatus> = {
  pending: "PENDING",
  assigned: "PENDING",
  picked_up: "PICKED_UP",
  on_the_way: "IN_TRANSIT",
  nearby: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  cancelled: "FAILED",
  returned: "RETURNED",
};

function verifyKwikSignature(req: Request): boolean {
  const secret = process.env.KWIK_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("[Kwik] KWIK_WEBHOOK_SECRET not set — skipping verification in dev");
      return true;
    }
    logger.warn("[Kwik] KWIK_WEBHOOK_SECRET not configured in production — rejecting request");
    return false;
  }

  const signature = req.headers["x-kwik-token"] as string | undefined;
  if (!signature) {
    logger.warn("[Kwik] Missing x-kwik-token header");
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

export async function handleKwikWebhook(req: Request, res: Response): Promise<void> {
  if (!verifyKwikSignature(req)) {
    logger.warn("[Kwik] Invalid or missing webhook signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const orderId = body.orderId as string | undefined;
  const tenantId = body.tenantId as string | undefined;
  const kwikStatus = body.status as string | undefined;
  const trackingUrl = body.tracking_url as string | undefined;
  const notes = body.notes as string | undefined;

  if (!orderId || !tenantId || !kwikStatus) {
    logger.warn("[Kwik] Webhook missing required fields", { orderId, tenantId, kwikStatus });
    res.status(400).json({ error: "orderId, tenantId, and status are required" });
    return;
  }

  const canonicalStatus = KWIK_STATUS_MAP[kwikStatus];
  if (!canonicalStatus) {
    logger.warn("[Kwik] Unknown status code — no-op", { kwikStatus });
    res.status(200).json({ ok: true, note: "Unknown status — ignored" });
    return;
  }

  const request = await getDeliveryRequestByOrderId(orderId);
  if (!request) {
    logger.warn("[Kwik] Delivery request not found", { orderId });
    res.status(404).json({ error: "Delivery request not found" });
    return;
  }

  await updateDeliveryRequestStatus(orderId, tenantId, canonicalStatus, {
    assignedProvider: "kwik",
  });

  await publishCommerceEvent(CommerceEvents.DELIVERY_STATUS, {
    orderId,
    tenantId,
    deliveryId: request.internalDeliveryId ?? orderId,
    provider: "kwik",
    status: canonicalStatus,
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(notes ? { notes } : {}),
  });

  logger.info("[Kwik] Webhook processed", { orderId, canonicalStatus });
  res.status(200).json({ ok: true });
}
