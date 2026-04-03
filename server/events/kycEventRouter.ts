/**
 * KYC Inbound Event Express Router [T-LOG-05]
 * Registered at /api/events/kyc
 * Receives webhook callbacks from the Fintech repo's KYC engine.
 *
 * Security: when KYC_WEBHOOK_SECRET is set, every request must carry
 * `Authorization: Bearer <secret>`. Requests without a valid secret are
 * rejected with 401 before any payload processing occurs.
 */

import { Router } from "express";
import { KycEvents } from "./kycTypes";
import { createLogger } from "../logger";
import { handleKycVerificationCompleted } from "./kycVerificationCompleted";

const logger = createLogger("KycEventRouter");

const kycEventRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Webhook shared-secret authentication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the Authorization header against KYC_WEBHOOK_SECRET.
 * Returns true if the request is authenticated (or if no secret is configured).
 * Logs a warning when the secret is unset so operators know auth is disabled.
 *
 * Exported for unit testing.
 */
export function isWebhookAuthenticated(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const webhookSecret = process.env.KYC_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn(
      "[KycEventRouter] KYC_WEBHOOK_SECRET is not set — webhook endpoint is unauthenticated. " +
        "Set this env var in production.",
    );
    return true; // Permissive in dev; must be locked down in prod via env var
  }
  const authHeader = req.headers["authorization"];
  return authHeader === `Bearer ${webhookSecret}`;
}

/**
 * POST /api/events/kyc
 * Generic KYC event endpoint — dispatches by event type.
 */
kycEventRouter.post("/", (req, res) => {
  const body = req.body as { type?: string; payload?: unknown };

  // ── Authentication check ────────────────────────────────────────────────
  if (!isWebhookAuthenticated(req as unknown as { headers: Record<string, string | string[] | undefined> })) {
    logger.warn("[KycEventRouter] Rejected unauthenticated webhook request", {
      type: body?.type,
      ip: req.socket?.remoteAddress,
    });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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
