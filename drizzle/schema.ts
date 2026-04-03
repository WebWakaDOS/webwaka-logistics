import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
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

export type ParcelStatus = (typeof PARCEL_STATUS)[number];

export const PARCEL_PRIORITY = ["STANDARD", "EXPRESS", "SAME_DAY"] as const;

export const SEAT_ASSIGNMENT_STATUS = [
  "none",
  "pending",
  "confirmed",
  "unavailable",
] as const;

export type SeatAssignmentStatus = (typeof SEAT_ASSIGNMENT_STATUS)[number];

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
  /** P12: Transport integration — trip this parcel is assigned to */
  tripId: text("tripId"),
  /** P12: Transport integration — waybill ID from the transport repo */
  waybillId: text("waybillId"),
  /** P12: Seat blocking status for transport cargo */
  seatAssignmentStatus: text("seatAssignmentStatus").default("none").notNull(),
  /** L-06: Delivery OTP — SHA-256 hash of the 4-digit code sent to the customer */
  otpCode: text("otpCode"),
  /** L-06: OTP expiry unix timestamp (10 minutes from generation) */
  otpExpiresAt: integer("otpExpiresAt"),
  /** L-06: Timestamp when the OTP was successfully verified by the rider */
  otpVerifiedAt: integer("otpVerifiedAt", { mode: "timestamp" }),
  /** T-LOG-03: Geocoded delivery coordinates — null if not yet geocoded */
  recipientLat: real("recipientLat"),
  recipientLng: real("recipientLng"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
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
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
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
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer("deletedAt", { mode: "timestamp" }),
});

export type ProofOfDelivery = typeof proofOfDelivery.$inferSelect;
export type InsertProofOfDelivery = typeof proofOfDelivery.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Delivery Requests — P04 Commerce ↔ Logistics event contract
// ─────────────────────────────────────────────────────────────────────────────

export const DELIVERY_REQUEST_STATUS = [
  "PENDING",
  "PICKING_PROVIDER",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED",
] as const;

export type DeliveryRequestStatus = (typeof DELIVERY_REQUEST_STATUS)[number];

export const deliveryRequests = sqliteTable("delivery_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: text("orderId").notNull().unique(),
  tenantId: text("tenantId").notNull(),
  sourceModule: text("sourceModule").notNull(),
  vendorId: text("vendorId"),
  pickupAddress: text("pickupAddress").notNull(),
  deliveryAddress: text("deliveryAddress").notNull(),
  itemsSummary: text("itemsSummary").notNull(),
  weightKg: real("weightKg"),
  status: text("status").default("PENDING").notNull(),
  assignedProvider: text("assignedProvider"),
  internalDeliveryId: text("internalDeliveryId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type DeliveryRequest = typeof deliveryRequests.$inferSelect;
export type InsertDeliveryRequest = typeof deliveryRequests.$inferInsert;
