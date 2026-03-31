/**
 * P12-T2: Outbound Transport Event Publisher
 * Publishes parcel.seats_required events to the webwaka-transport service.
 *
 * Called when a parcel is confirmed for shipment on a specific transport trip.
 * Uses Authorization: Bearer {INTER_SERVICE_SECRET} for authentication.
 */

import { eq, and, isNull } from "drizzle-orm";
import { parcels } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { createLogger } from "./logger";

const logger = createLogger("TransportEvents");

export type SeatsRequiredResult =
  | { outcome: "confirmed"; blockedSeatIds: number[] }
  | { outcome: "unavailable"; available: number; requested: number }
  | { outcome: "pending_retry" };

/**
 * Publish a parcel.seats_required event to the transport service.
 *
 * On success: parcel seatAssignmentStatus is updated to "confirmed" or "unavailable".
 * On failure: parcel is marked "pending" for retry on next sync.
 *
 * @param parcelId  Internal logistics parcel ID
 * @param tenantId  Tenant scoping for the parcel record
 */
export async function publishSeatsRequired(
  parcelId: number,
  tenantId: string,
): Promise<SeatsRequiredResult> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const parcelRows = db
    .select()
    .from(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.tenantId, tenantId), isNull(parcels.deletedAt)))
    .limit(1)
    .all();

  const parcel = parcelRows[0];
  if (!parcel) throw new Error(`Parcel not found: id=${parcelId} tenantId=${tenantId}`);

  if (!parcel.tripId) {
    throw new Error(`Parcel ${parcelId} is not linked to a transport trip`);
  }

  const transportUrl = ENV.transportBaseUrl;
  const secret = ENV.interServiceSecret;

  if (!transportUrl || !secret) {
    logger.warn("TRANSPORT_BASE_URL or INTER_SERVICE_SECRET not configured — marking pending", {
      parcelId,
    });
    db.update(parcels)
      .set({ seatAssignmentStatus: "pending", updatedAt: new Date() })
      .where(and(eq(parcels.id, parcelId), eq(parcels.tenantId, tenantId)))
      .run();
    return { outcome: "pending_retry" };
  }

  const weightKg = parcel.weightGrams / 1000;
  const seatsNeeded = Math.ceil(weightKg / 30);

  const body = {
    trip_id: parcel.tripId,
    seats_needed: seatsNeeded,
    parcel_id: parcel.id,
    weight_kg: weightKg,
    declared_value_kobo: parcel.insuranceValueKobo,
  };

  try {
    const response = await fetch(`${transportUrl}/api/internal/transport-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
        "X-Webwaka-Event-Type": "parcel.seats_required",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Transport service returned ${response.status}`);
    }

    const json = (await response.json()) as Record<string, unknown>;

    if (json.seats_confirmed === true) {
      db.update(parcels)
        .set({ seatAssignmentStatus: "confirmed", updatedAt: new Date() })
        .where(and(eq(parcels.id, parcelId), eq(parcels.tenantId, tenantId)))
        .run();

      logger.info("Seats confirmed for parcel", {
        parcelId,
        tripId: parcel.tripId,
        seatsNeeded,
        blockedSeatIds: json.blocked_seat_ids,
      });

      return {
        outcome: "confirmed",
        blockedSeatIds: Array.isArray(json.blocked_seat_ids)
          ? (json.blocked_seat_ids as number[])
          : [],
      };
    }

    if (json.seats_unavailable === true) {
      db.update(parcels)
        .set({ seatAssignmentStatus: "unavailable", updatedAt: new Date() })
        .where(and(eq(parcels.id, parcelId), eq(parcels.tenantId, tenantId)))
        .run();

      logger.warn("Cargo space full on trip — parcel must be rescheduled", {
        parcelId,
        tripId: parcel.tripId,
        available: json.available,
        requested: seatsNeeded,
      });

      return {
        outcome: "unavailable",
        available: (json.available as number) ?? 0,
        requested: seatsNeeded,
      };
    }

    // Unexpected response shape — treat as transient failure
    throw new Error(`Unexpected transport response: ${JSON.stringify(json)}`);
  } catch (err: unknown) {
    logger.error("Failed to publish parcel.seats_required — marking pending for retry", {
      parcelId,
      tripId: parcel.tripId,
      err: String(err),
    });

    db.update(parcels)
      .set({ seatAssignmentStatus: "pending", updatedAt: new Date() })
      .where(and(eq(parcels.id, parcelId), eq(parcels.tenantId, tenantId)))
      .run();

    return { outcome: "pending_retry" };
  }
}
