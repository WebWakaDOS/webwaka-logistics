/**
 * Commerce Event Bus Publisher [P04, CORE-2]
 * Publishes events to the COMMERCE_EVENTS queue.
 * Event type strings must ONLY come from @webwaka/core CommerceEvents.
 */

import type { CommerceEventType, PlatformEvent } from "@webwaka/core";
import { createLogger } from "../logger";

const logger = createLogger("CommerceEventBus");

/**
 * Publish an event to the COMMERCE_EVENTS queue.
 *
 * Current implementation: structured log + HTTP forward (if COMMERCE_EVENTS_URL is set).
 * Future: replace with message broker publish (Cloudflare Queues, etc.).
 */
export async function publishCommerceEvent<T>(
  type: CommerceEventType,
  payload: T
): Promise<void> {
  const event: PlatformEvent<T> = {
    type,
    payload,
    publishedAt: new Date().toISOString(),
  };

  logger.info(`[CommerceEventBus] Publishing event: ${type}`, {
    type,
    publishedAt: event.publishedAt,
  });

  const commerceEventsUrl = process.env.COMMERCE_EVENTS_URL;
  if (commerceEventsUrl) {
    try {
      const res = await fetch(commerceEventsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        logger.warn(`[CommerceEventBus] Event delivery returned ${res.status}`, { type });
      } else {
        logger.info(`[CommerceEventBus] Event delivered successfully: ${type}`);
      }
    } catch (err) {
      logger.error(`[CommerceEventBus] Failed to deliver event: ${type}`, { err: String(err) });
    }
  } else {
    logger.debug("[CommerceEventBus] COMMERCE_EVENTS_URL not set — event logged only (no HTTP delivery)");
  }
}
