/**
 * Platform Event Bus Publisher [Part 5, CORE-2]
 * Blueprint: "Modules must communicate via events instead of direct dependencies."
 * Events published: parcel.created, parcel.dispatched, parcel.status_updated, parcel.delivered
 *
 * This module publishes events to the CORE-2 Platform Event Bus.
 * In the current scaffold, events are emitted as structured log entries and
 * forwarded to the notification service. When CORE-2 is wired via a message broker,
 * this module will be the single integration point — no other module touches the bus directly.
 */

import { createLogger } from "./logger";

const logger = createLogger("EventBus");

export type ParcelEvent =
  | "parcel.created"
  | "parcel.collected"
  | "parcel.dispatched"
  | "parcel.status_updated"
  | "parcel.out_for_delivery"
  | "parcel.delivered"
  | "parcel.failed"
  | "parcel.returned"
  | "parcel.trip_assigned";

export interface EventPayload {
  event: ParcelEvent;
  tenantId: string;
  parcelId: number;
  trackingNumber: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/**
 * Publish an event to the CORE-2 Platform Event Bus [Part 5].
 * Structured for future integration with a message broker (e.g., Cloudflare Queues).
 */
export async function publishEvent(payload: EventPayload): Promise<void> {
  logger.info(`Event published: ${payload.event}`, {
    tenantId: payload.tenantId,
    parcelId: payload.parcelId,
    trackingNumber: payload.trackingNumber,
    event: payload.event,
    timestamp: payload.timestamp,
  });

  // CORE-2 integration point: when the platform event bus is available,
  // replace the logger call above with the actual bus publish call.
  // Example: await platformEventBus.publish(payload.event, payload);
}
