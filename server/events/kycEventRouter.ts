/**
 * KYC Inbound Event Express Router [T-LOG-05]
 * Registered at /api/events/kyc
 * Receives webhook callbacks from the Fintech repo's KYC engine.
 */

import { Router } from "express";
import { KycEvents } from "./kycTypes";
import { createLogger } from "../logger";
import { handleKycVerificationCompleted } from "./kycVerificationCompleted";

const logger = createLogger("KycEventRouter");

const kycEventRouter = Router();

/**
 * POST /api/events/kyc
 * Generic KYC event endpoint — dispatches by event type.
 */
kycEventRouter.post("/", (req, res) => {
  const body = req.body as { type?: string; payload?: unknown };

  logger.info("[KycEventRouter] Received event", { type: body?.type });

  const handle = async () => {
    if (!body || typeof body.type !== "string") {
      res.status(400).json({ error: "Missing or invalid event type" });
      return;
    }

    switch (body.type) {
      case KycEvents.VERIFICATION_COMPLETED:
        await handleKycVerificationCompleted(body.payload);
        res.status(200).json({ ok: true });
        break;

      default:
        logger.warn(`[KycEventRouter] Unknown event type — ignoring`, { type: body.type });
        res.status(200).json({ ok: true, ignored: true });
    }
  };

  handle().catch((err) => {
    logger.error("[KycEventRouter] Unhandled error", { err: String(err) });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal error" });
    }
  });
});

export { kycEventRouter };
