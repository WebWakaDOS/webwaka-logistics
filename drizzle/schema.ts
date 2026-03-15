import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  bigint,
  decimal,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * [Part 4] Platform Module Architecture — shared across all modules.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// LOG-2: Parcel & Delivery Module [Part 10.4]
// Blueprint: Part 9.2 — tenantId on all models, soft deletes, kobo integers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parcel status state machine [Part 10.4]:
 * PENDING → COLLECTED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED | FAILED | RETURNED
 */
export const PARCEL_STATUS = [
  "PENDING",
  "COLLECTED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
] as const;

export type ParcelStatus = (typeof PARCEL_STATUS)[number];

/**
 * Parcel priority levels for dispatch management.
 */
export const PARCEL_PRIORITY = ["STANDARD", "EXPRESS", "SAME_DAY"] as const;
export type ParcelPriority = (typeof PARCEL_PRIORITY)[number];

/**
 * parcels — core shipment records [Part 10.4]
 * All monetary values stored in kobo (integer) per [Part 9.2].
 * tenantId on all models per [Part 9.2].
 * Soft deletes via deletedAt per [Part 9.2].
 */
export const parcels = mysqlTable("parcels", {
  id: int("id").autoincrement().primaryKey(),
  /** Multi-tenancy: every record scoped to a tenant [Part 9.2] */
  tenantId: varchar("tenantId", { length: 64 }).notNull(),
  /** Human-readable tracking number, unique per tenant */
  trackingNumber: varchar("trackingNumber", { length: 32 }).notNull(),
  /** Parcel lifecycle state machine */
  status: mysqlEnum("status", PARCEL_STATUS).default("PENDING").notNull(),
  priority: mysqlEnum("priority", PARCEL_PRIORITY).default("STANDARD").notNull(),

  // Sender details
  senderName: varchar("senderName", { length: 255 }).notNull(),
  senderPhone: varchar("senderPhone", { length: 20 }).notNull(),
  senderAddress: text("senderAddress").notNull(),

  // Recipient details
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),
  recipientAddress: text("recipientAddress").notNull(),
  recipientCity: varchar("recipientCity", { length: 100 }).notNull(),
  recipientState: varchar("recipientState", { length: 100 }).notNull(),

  // Parcel details
  description: text("description"),
  weightGrams: int("weightGrams").default(0).notNull(),
  /** Delivery fee stored in kobo (NGN × 100) per [Part 9.2] */
  deliveryFeeKobo: bigint("deliveryFeeKobo", { mode: "number" }).default(0).notNull(),
  /** Insurance value stored in kobo per [Part 9.2] */
  insuranceValueKobo: bigint("insuranceValueKobo", { mode: "number" }).default(0).notNull(),
  /** ISO 4217 currency code — NGN default, multi-currency for Africa First [Part 9.1] */
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),

  // Assignment
  /** FK to users.id — the dispatch agent assigned to this parcel */
  assignedAgentId: int("assignedAgentId"),
  /** FK to users.id — the staff member who created this parcel */
  createdById: int("createdById").notNull(),

  // Estimated delivery
  estimatedDeliveryAt: timestamp("estimatedDeliveryAt"),
  actualDeliveryAt: timestamp("actualDeliveryAt"),

  // Offline sync support [Part 6] — client-generated ID for optimistic updates
  clientId: varchar("clientId", { length: 64 }),

  // Audit fields
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /** Soft delete per [Part 9.2] — never hard-delete critical records */
  deletedAt: timestamp("deletedAt"),
});

export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = typeof parcels.$inferInsert;

/**
 * parcel_updates — immutable tracking event log [Part 10.4]
 * Each status change appends a new record; never mutates existing records.
 */
export const parcelUpdates = mysqlTable("parcel_updates", {
  id: int("id").autoincrement().primaryKey(),
  /** Multi-tenancy scoping [Part 9.2] */
  tenantId: varchar("tenantId", { length: 64 }).notNull(),
  parcelId: int("parcelId").notNull(),
  status: mysqlEnum("status", PARCEL_STATUS).notNull(),
  /** Human-readable location description */
  location: varchar("location", { length: 255 }),
  /** Latitude for GPS tracking */
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  /** Longitude for GPS tracking */
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  notes: text("notes"),
  /** FK to users.id — agent who recorded this update */
  recordedById: int("recordedById").notNull(),
  /** WAT timestamp (UTC+1) stored as UTC per [Part 9.2] */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ParcelUpdate = typeof parcelUpdates.$inferSelect;
export type InsertParcelUpdate = typeof parcelUpdates.$inferInsert;

/**
 * proof_of_delivery — delivery confirmation records [Part 10.4]
 * Images and signatures stored in S3/R2 via platform storage helpers.
 * [Part 9.2] — soft delete, tenantId.
 */
export const proofOfDelivery = mysqlTable("proof_of_delivery", {
  id: int("id").autoincrement().primaryKey(),
  /** Multi-tenancy scoping [Part 9.2] */
  tenantId: varchar("tenantId", { length: 64 }).notNull(),
  parcelId: int("parcelId").notNull(),
  /** URL to delivery photo stored in S3/R2 */
  imageUrl: text("imageUrl"),
  /** S3 key for the delivery photo */
  imageKey: varchar("imageKey", { length: 512 }),
  /** URL to recipient signature stored in S3/R2 */
  signatureUrl: text("signatureUrl"),
  /** S3 key for the signature */
  signatureKey: varchar("signatureKey", { length: 512 }),
  /** Name of person who received the parcel */
  receivedByName: varchar("receivedByName", { length: 255 }).notNull(),
  /** Relationship to recipient (e.g., "Self", "Neighbour", "Security") */
  receivedByRelation: varchar("receivedByRelation", { length: 100 }).default("Self").notNull(),
  /** FK to users.id — delivery agent who captured the POD */
  capturedById: int("capturedById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Soft delete per [Part 9.2] */
  deletedAt: timestamp("deletedAt"),
});

export type ProofOfDelivery = typeof proofOfDelivery.$inferSelect;
export type InsertProofOfDelivery = typeof proofOfDelivery.$inferInsert;
