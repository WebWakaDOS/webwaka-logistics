import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const PARCEL_STATUS = [
  "PENDING",
  "COLLECTED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
] as const;

export const PARCEL_PRIORITY = ["STANDARD", "EXPRESS", "SAME_DAY"] as const;

export const parcels = sqliteTable("parcels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenantId").notNull(),
  trackingNumber: text("trackingNumber").notNull(),
  status: text("status").default("PENDING").notNull(),
  priority: text("priority").default("STANDARD").notNull(),
  senderName: text("senderName").notNull(),
  senderPhone: text("senderPhone").notNull(),
  senderAddress: text("senderAddress").notNull(),
  recipientName: text("recipientName").notNull(),
  recipientPhone: text("recipientPhone").notNull(),
  recipientAddress: text("recipientAddress").notNull(),
  recipientCity: text("recipientCity").notNull(),
  recipientState: text("recipientState").notNull(),
  description: text("description"),
  weightGrams: integer("weightGrams").default(0).notNull(),
  deliveryFeeKobo: integer("deliveryFeeKobo").default(0).notNull(),
  insuranceValueKobo: integer("insuranceValueKobo").default(0).notNull(),
  currency: text("currency").default("NGN").notNull(),
  assignedAgentId: integer("assignedAgentId"),
  createdById: integer("createdById").notNull(),
  estimatedDeliveryAt: integer("estimatedDeliveryAt", { mode: "timestamp" }),
  actualDeliveryAt: integer("actualDeliveryAt", { mode: "timestamp" }),
  clientId: text("clientId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deletedAt", { mode: "timestamp" }),
});

export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = typeof parcels.$inferInsert;

export const parcelUpdates = sqliteTable("parcel_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenantId").notNull(),
  parcelId: integer("parcelId").notNull(),
  status: text("status").notNull(),
  location: text("location"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  notes: text("notes"),
  recordedById: integer("recordedById").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export type ParcelUpdate = typeof parcelUpdates.$inferSelect;
export type InsertParcelUpdate = typeof parcelUpdates.$inferInsert;

export const proofOfDelivery = sqliteTable("proof_of_delivery", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenantId").notNull(),
  parcelId: integer("parcelId").notNull(),
  imageUrl: text("imageUrl"),
  imageKey: text("imageKey"),
  signatureUrl: text("signatureUrl"),
  signatureKey: text("signatureKey"),
  receivedByName: text("receivedByName").notNull(),
  receivedByRelation: text("receivedByRelation").default("Self").notNull(),
  capturedById: integer("capturedById").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deletedAt", { mode: "timestamp" }),
});

export type ProofOfDelivery = typeof proofOfDelivery.$inferSelect;
export type InsertProofOfDelivery = typeof proofOfDelivery.$inferInsert;
