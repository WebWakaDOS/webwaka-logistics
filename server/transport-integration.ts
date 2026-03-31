/**
 * P12-T1: Transport Event Receiver Endpoint
 * POST /internal/transport-events
 *
 * Receives events from the webwaka-transport service.
 * Authentication: Authorization: Bearer {INTER_SERVICE_SECRET}
 * Event type routing: X-Webwaka-Event-Type header
 */

import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { parcels } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { createLogger } from "./logger";
import { generateTrackingNumber } from "./parcels.utils";

const logger = createLogger("TransportIntegration");

// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware
// ─────────────────────────────────────────────────────────────────────────────

function verifyInterServiceAuth(req: Request, res: Response): boolean {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization header" });
    return false;
  }

  const token = authHeader.slice(7);
  const secret = ENV.interServiceSecret;

  if (!secret) {
    logger.warn("INTER_SERVICE_SECRET is not configured — rejecting request");
    res.status(401).json({ error: "Service not configured for inter-service auth" });
    return false;
  }

  if (token !== secret) {
    logger.warn("Invalid inter-service secret presented");
    res.status(401).json({ error: "Invalid authorization token" });
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle parcel.waybill_created from transport repo.
 * Creates a parcel record in the logistics DB linked to the trip.
 */
async function handleWaybillCreated(payload: unknown): Promise<void> {
  const data = payload as {
    trip_id: string;
    waybill_id: string;
    sender: { name: string; phone: string; address: string };
    recipient: { name: string; phone: string; address: string; city?: string; state?: string };
    description?: string;
    weight_kg: number;
    declared_value_kobo: number;
    fees_kobo: number;
  };

  if (!data.trip_id || !data.waybill_id) {
    throw new Error("parcel.waybill_created: missing trip_id or waybill_id");
  }

  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const trackingNumber = generateTrackingNumber();
  const weightGrams = Math.round(data.weight_kg * 1000);

  db.insert(parcels).values({
    tenantId: data.trip_id,
    trackingNumber,
    status: "PENDING",
    priority: "STANDARD",
    senderName: data.sender.name,
    senderPhone: data.sender.phone,
    senderAddress: data.sender.address,
    recipientName: data.recipient.name,
    recipientPhone: data.recipient.phone,
    recipientAddress: data.recipient.address,
    recipientCity: data.recipient.city ?? "",
    recipientState: data.recipient.state ?? "",
    description: data.description ?? null,
    weightGrams,
    deliveryFeeKobo: data.fees_kobo,
    insuranceValueKobo: data.declared_value_kobo,
    currency: "NGN",
    createdById: 0,
    tripId: data.trip_id,
    waybillId: data.waybill_id,
    seatAssignmentStatus: "none",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();

  logger.info("Parcel created from transport waybill", {
    tripId: data.trip_id,
    waybillId: data.waybill_id,
    trackingNumber,
  });
}

/**
 * Handle trip.state_changed from transport repo.
 * Updates parcel statuses based on the new trip state.
 */
async function handleTripStateChanged(payload: unknown): Promise<void> {
  const data = payload as { trip_id: string; new_state: string };

  if (!data.trip_id || !data.new_state) {
    throw new Error("trip.state_changed: missing trip_id or new_state");
  }

  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  if (data.new_state === "in_transit") {
    const result = db
      .update(parcels)
      .set({ status: "IN_TRANSIT", updatedAt: new Date() })
      .where(
        and(
          eq(parcels.tripId, data.trip_id),
          eq(parcels.status, "PENDING"),
        ),
      )
      .run();

    logger.info("Marked parcels IN_TRANSIT for trip", {
      tripId: data.trip_id,
      affected: result.changes,
    });
  } else if (data.new_state === "completed") {
    const now = new Date();
    const result = db
      .update(parcels)
      .set({ status: "DELIVERED", actualDeliveryAt: now, updatedAt: now })
      .where(
        and(
          eq(parcels.tripId, data.trip_id),
          eq(parcels.status, "IN_TRANSIT"),
        ),
      )
      .run();

    logger.info("Marked parcels DELIVERED for completed trip", {
      tripId: data.trip_id,
      affected: result.changes,
    });
  } else {
    logger.info("trip.state_changed: no status transition for state", {
      tripId: data.trip_id,
      newState: data.new_state,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const transportIntegrationRouter = Router();

transportIntegrationRouter.post("/transport-events", (req: Request, res: Response) => {
  if (!verifyInterServiceAuth(req, res)) return;

  const eventType = req.headers["x-webwaka-event-type"] as string | undefined;
  const payload = req.body;

  if (!eventType) {
    res.status(400).json({ error: "Missing X-Webwaka-Event-Type header" });
    return;
  }

  logger.info("Received transport event", { eventType });

  const handle = async () => {
    switch (eventType) {
      case "parcel.waybill_created":
        await handleWaybillCreated(payload);
        res.status(200).json({ received: true });
        break;

      case "trip.state_changed":
        await handleTripStateChanged(payload);
        res.status(200).json({ received: true });
        break;

      default:
        logger.info("Unhandled transport event type — acknowledged", { eventType });
        res.status(200).json({ received: true, note: "event type not handled" });
    }
  };

  handle().catch((err: unknown) => {
    logger.error("Error handling transport event", { eventType, err: String(err) });
    if (!res.headersSent) {
      res.status(200).json({ received: true, note: "event type not handled" });
    }
  });
});

export { transportIntegrationRouter };
