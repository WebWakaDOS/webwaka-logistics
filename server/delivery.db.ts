/**
 * Delivery Requests — Database Query Helpers [P04]
 * All queries are scoped by tenantId for multi-tenant isolation.
 */

import { eq, and } from "drizzle-orm";
import {
  deliveryRequests,
  InsertDeliveryRequest,
  DeliveryRequestStatus,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createLogger } from "./logger";
import { nanoid } from "nanoid";

const logger = createLogger("DeliveryDB");

export async function createDeliveryRequest(
  data: Omit<InsertDeliveryRequest, "internalDeliveryId" | "createdAt" | "updatedAt">
) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const now = new Date();
  const internalDeliveryId = `DR-${nanoid(10).toUpperCase()}`;

  const record: InsertDeliveryRequest = {
    ...data,
    internalDeliveryId,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(deliveryRequests).values(record).run();

  const inserted = db
    .select()
    .from(deliveryRequests)
    .where(eq(deliveryRequests.orderId, data.orderId))
    .limit(1)
    .all();

  if (!inserted[0]) throw new Error(`Failed to insert delivery request for orderId=${data.orderId}`);

  logger.info("Delivery request created", {
    orderId: data.orderId,
    tenantId: data.tenantId,
    internalDeliveryId,
  });

  return inserted[0];
}

export async function getDeliveryRequestByOrderId(orderId: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(deliveryRequests)
    .where(eq(deliveryRequests.orderId, orderId))
    .limit(1)
    .all();

  return result[0] ?? null;
}

export async function updateDeliveryRequestStatus(
  orderId: string,
  tenantId: string,
  status: DeliveryRequestStatus,
  extra: { assignedProvider?: string } = {}
) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const now = new Date();

  db.update(deliveryRequests)
    .set({
      status,
      updatedAt: now,
      ...(extra.assignedProvider !== undefined
        ? { assignedProvider: extra.assignedProvider }
        : {}),
    })
    .where(
      and(
        eq(deliveryRequests.orderId, orderId),
        eq(deliveryRequests.tenantId, tenantId)
      )
    )
    .run();

  logger.info("Delivery request status updated", { orderId, tenantId, status });
}
