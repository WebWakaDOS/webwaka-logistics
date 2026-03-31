/**
 * Commerce Event Inbound Express Router [P04 — TASK 2]
 * Receives events from the COMMERCE_EVENTS queue via HTTP.
 * In production this would be replaced by a queue consumer (Cloudflare Queues, etc.).
 */

import { Router } from "express";
import { CommerceEvents } from "@webwaka/core";
import { handleOrderReadyForDelivery } from "./orderReadyForDelivery";
import { createLogger } from "../logger";

const logger = createLogger("CommerceEventRouter");

const commerceEventRouter = Router();

commerceEventRouter.post("/", (req, res) => {
  const body = req.body as Record<string, unknown>;
  const eventType = body.type as string | undefined;
  const payload = body.payload;

  if (!eventType) {
    res.status(400).json({ error: "Event type is required" });
    return;
  }

  logger.info(`Inbound commerce event: ${eventType}`);

  switch (eventType) {
    case CommerceEvents.ORDER_READY_DELIVERY:
      handleOrderReadyForDelivery(payload)
        .then(() => {
          if (!res.headersSent) res.status(200).json({ ok: true });
        })
        .catch((err: unknown) => {
          logger.error("Error handling order.ready_for_delivery", { err: String(err) });
          if (!res.headersSent) res.status(500).json({ error: "Handler failed" });
        });
      break;

    default:
      logger.warn(`Unhandled event type: ${eventType}`);
      res.status(200).json({ ok: true, note: "Event type not handled — ignored" });
  }
});

export { commerceEventRouter };
