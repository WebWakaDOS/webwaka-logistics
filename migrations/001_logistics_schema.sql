-- WebWaka Logistics Suite — D1 Schema Migration
-- All monetary values in kobo (integer), soft deletes enforced
-- Timestamps stored as INTEGER (Unix epoch seconds)
-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS logi_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  lastSignedIn INTEGER NOT NULL DEFAULT (unixepoch())
);
-- ============================================================
-- PARCELS
-- ============================================================
CREATE TABLE IF NOT EXISTS logi_parcels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenantId TEXT NOT NULL,
  trackingNumber TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  priority TEXT NOT NULL DEFAULT 'STANDARD',
  senderName TEXT NOT NULL,
  senderPhone TEXT NOT NULL,
  senderAddress TEXT NOT NULL,
  recipientName TEXT NOT NULL,
  recipientPhone TEXT NOT NULL,
  recipientAddress TEXT NOT NULL,
  recipientCity TEXT NOT NULL,
  recipientState TEXT NOT NULL,
  description TEXT,
  weightGrams INTEGER NOT NULL DEFAULT 0,
  deliveryFeeKobo INTEGER NOT NULL DEFAULT 0,
  insuranceValueKobo INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  assignedAgentId INTEGER,
  createdById INTEGER NOT NULL,
  estimatedDeliveryAt INTEGER,
  actualDeliveryAt INTEGER,
  clientId TEXT,
  tripId TEXT,
  waybillId TEXT,
  seatAssignmentStatus TEXT NOT NULL DEFAULT 'none',
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  deletedAt INTEGER
);
-- ============================================================
-- PARCEL UPDATES (immutable event log)
-- ============================================================
CREATE TABLE IF NOT EXISTS logi_parcel_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenantId TEXT NOT NULL,
  parcelId INTEGER NOT NULL,
  status TEXT NOT NULL,
  location TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT,
  recordedById INTEGER NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);
-- ============================================================
-- PROOF OF DELIVERY
-- ============================================================
CREATE TABLE IF NOT EXISTS logi_proof_of_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenantId TEXT NOT NULL,
  parcelId INTEGER NOT NULL,
  imageUrl TEXT,
  imageKey TEXT,
  signatureUrl TEXT,
  signatureKey TEXT,
  receivedByName TEXT NOT NULL,
  receivedByRelation TEXT NOT NULL DEFAULT 'Self',
  capturedById INTEGER NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  deletedAt INTEGER
);
-- ============================================================
-- DELIVERY REQUESTS (P04 Commerce ↔ Logistics event contract)
-- ============================================================
CREATE TABLE IF NOT EXISTS logi_delivery_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId TEXT NOT NULL UNIQUE,
  tenantId TEXT NOT NULL,
  sourceModule TEXT NOT NULL,
  vendorId TEXT,
  pickupAddress TEXT NOT NULL,
  deliveryAddress TEXT NOT NULL,
  itemsSummary TEXT NOT NULL,
  weightKg REAL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  assignedProvider TEXT,
  internalDeliveryId TEXT,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);
-- ============================================================
-- SCHEMA MIGRATIONS TRACKER
-- ============================================================
CREATE TABLE IF NOT EXISTS logi_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO logi_schema_migrations (version) VALUES ('001_logistics_schema');
