/**
 * Riders & KYC — Database Query Helpers [T-LOG-05]
 * Multi-tenant: all queries scoped by tenantId.
 * NDPR: no raw license numbers or BVN stored — only R2 document keys/URLs.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  Guarantor,
  InsertGuarantor,
  InsertRider,
  Rider,
  RiderKycStatus,
  guarantors,
  riders,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createLogger } from "./logger";

const logger = createLogger("RidersDB");

// ─────────────────────────────────────────────────────────────────────────────
// Rider CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createRider(data: InsertRider): Promise<Rider> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Creating rider application", {
    tenantId: data.tenantId,
    fullName: data.fullName,
  });

  db.insert(riders).values(data).run();

  const result = db
    .select()
    .from(riders)
    .where(
      and(
        eq(riders.tenantId, data.tenantId),
        eq(riders.phone, data.phone),
      ),
    )
    .orderBy(desc(riders.id))
    .limit(1)
    .all();

  if (!result[0]) throw new Error("Failed to retrieve created rider");
  return result[0];
}

export async function getRiderById(
  tenantId: string,
  riderId: number,
): Promise<Rider | null> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(riders)
    .where(and(eq(riders.tenantId, tenantId), eq(riders.id, riderId)))
    .limit(1)
    .all();

  return result[0] ?? null;
}

export async function getRiderByUserId(
  tenantId: string,
  userId: number,
): Promise<Rider | null> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const result = db
    .select()
    .from(riders)
    .where(and(eq(riders.tenantId, tenantId), eq(riders.userId, userId)))
    .limit(1)
    .all();

  return result[0] ?? null;
}

export async function listRiders(tenantId: string): Promise<Rider[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(riders)
    .where(eq(riders.tenantId, tenantId))
    .orderBy(desc(riders.createdAt))
    .all();
}

export async function updateRiderKycStatus(
  tenantId: string,
  riderId: number,
  kycStatus: RiderKycStatus,
  fields: {
    kycReference?: string;
    rejectionReason?: string;
    verifiedAt?: Date;
    submittedAt?: Date;
  } = {},
): Promise<Rider | null> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Updating rider KYC status", { tenantId, riderId, kycStatus });

  db.update(riders)
    .set({
      kycStatus,
      updatedAt: new Date(),
      ...(fields.kycReference !== undefined && { kycReference: fields.kycReference }),
      ...(fields.rejectionReason !== undefined && { rejectionReason: fields.rejectionReason }),
      ...(fields.verifiedAt !== undefined && { verifiedAt: fields.verifiedAt }),
      ...(fields.submittedAt !== undefined && { submittedAt: fields.submittedAt }),
    })
    .where(and(eq(riders.tenantId, tenantId), eq(riders.id, riderId)))
    .run();

  return getRiderById(tenantId, riderId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Guarantor CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createGuarantor(data: InsertGuarantor): Promise<Guarantor> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  logger.info("Creating guarantor", { tenantId: data.tenantId, riderId: data.riderId });

  db.insert(guarantors).values(data).run();

  const result = db
    .select()
    .from(guarantors)
    .where(
      and(
        eq(guarantors.tenantId, data.tenantId),
        eq(guarantors.riderId, data.riderId),
        eq(guarantors.phone, data.phone),
      ),
    )
    .orderBy(desc(guarantors.id))
    .limit(1)
    .all();

  if (!result[0]) throw new Error("Failed to retrieve created guarantor");
  return result[0];
}

export async function getGuarantorsByRiderId(
  tenantId: string,
  riderId: number,
): Promise<Guarantor[]> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  return db
    .select()
    .from(guarantors)
    .where(
      and(eq(guarantors.tenantId, tenantId), eq(guarantors.riderId, riderId)),
    )
    .all();
}
