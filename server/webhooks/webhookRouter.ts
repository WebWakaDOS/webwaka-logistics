/**
 * Provider Webhook Express Router [P04 — TASK 4]
 * Registers webhook endpoints for GIG, Kwik, and Sendbox.
 */

import { Router } from "express";
import { handleGigWebhook } from "./providers/gig";
import { handleKwikWebhook } from "./providers/kwik";
import { handleSendboxWebhook } from "./providers/sendbox";

const webhookRouter = Router();

webhookRouter.post("/gig", (req, res) => {
  handleGigWebhook(req, res).catch(() => {
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  });
});

webhookRouter.post("/kwik", (req, res) => {
  handleKwikWebhook(req, res).catch(() => {
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  });
});

webhookRouter.post("/sendbox", (req, res) => {
  handleSendboxWebhook(req, res).catch(() => {
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  });
});

export { webhookRouter };
