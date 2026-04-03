/**
 * KYC Event Bus Publisher [T-LOG-05]
 * Publishes events to the KYC_EVENTS_URL (Fintech repo listener).
 * Event type strings must ONLY come from kycTypes (local source of truth).
 */

import type { KycEventType, KycPlatformEvent } from "./kycTypes";
import { createLogger } from "../logger";

const logger = createLogger("KycEventBus");

/**
 * Publish a KYC event to the Fintech repo.
 *
 * Current implementation: structured log + HTTP forward (if KYC_EVENTS_URL is set).
 * Future: replace with message broker publish (Cloudflare Queues, etc.).
 */
export async function publishKycEvent<T>(
  type: KycEventType,
  payload: T,
): Promise<void> {
  const event: KycPlatformEvent<T> = {
    type,
    payload,
    publishedAt: new Date().toISOString(),
  };

  logger.info(`[KycEventBus] Publishing event: ${type}`, {
    type,
    publishedAt: event.publishedAt,
  });

  const kycEventsUrl = process.env.KYC_EVENTS_URL;
  if (kycEventsUrl) {
    try {
      const res = await fetch(kycEventsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        logger.warn(`[KycEventBus] Event delivery returned ${res.status}`, { type });
      } else {
        logger.info(`[KycEventBus] Event delivered successfully: ${type}`);
      }
    } catch (err) {
      logger.error(`[KycEventBus] Failed to deliver event: ${type}`, {
        err: String(err),
      });
    }
  } else {
    logger.debug(
      "[KycEventBus] KYC_EVENTS_URL not set — event logged only (no HTTP delivery)",
    );
  }
}
