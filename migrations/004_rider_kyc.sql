-- ════════════════════════════════════════════════════════════════════════════
-- Migration 004: Rider KYC & Guarantors — T-LOG-05
-- Adds gig rider onboarding tables with automated KYC state machine.
--
-- NDPR compliance:
--   - No raw driver's license numbers stored.
--   - No BVN stored. Only R2 document URLs.
--   - All rows are tenant-scoped (tenantId NOT NULL).
-- ════════════════════════════════════════════════════════════════════════════

-- Riders table: KYC state machine PENDING → VERIFYING → ACTIVE | REJECTED
CREATE TABLE IF NOT EXISTS riders (
  id               INTEGER  PRIMARY KEY AUTOINCREMENT,
  tenantId         TEXT     NOT NULL,
  userId           INTEGER,                   -- FK to users.id (nullable)
  fullName         TEXT     NOT NULL,
  phone            TEXT     NOT NULL,
  address          TEXT     NOT NULL,
  state            TEXT     NOT NULL,
  lga              TEXT     NOT NULL,
  vehicleType      TEXT     NOT NULL,         -- BIKE | CAR | VAN | TRUCK
  plateNumber      TEXT     NOT NULL,
  licenseDocKey    TEXT,                      -- R2 object key (NDPR: no raw number)
  licenseDocUrl    TEXT,                      -- Signed R2 URL
  licenseExpiresAt INTEGER,                   -- Unix epoch seconds (F-02 expiry tracking)
  kycStatus        TEXT     NOT NULL DEFAULT 'PENDING',  -- PENDING | VERIFYING | ACTIVE | REJECTED
  kycReference     TEXT,                      -- Opaque ref from Fintech KYC system
  rejectionReason  TEXT,
  submittedAt      INTEGER,
  verifiedAt       INTEGER,
  createdAt        INTEGER  NOT NULL DEFAULT (unixepoch()),
  updatedAt        INTEGER  NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_riders_tenant
  ON riders(tenantId);

CREATE INDEX IF NOT EXISTS idx_riders_tenant_status
  ON riders(tenantId, kycStatus);

CREATE INDEX IF NOT EXISTS idx_riders_user
  ON riders(tenantId, userId);

-- Guarantors table: linked to riders (min 1 per rider, max 2)
CREATE TABLE IF NOT EXISTS guarantors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenantId     TEXT    NOT NULL,
  riderId      INTEGER NOT NULL REFERENCES riders(id),
  fullName     TEXT    NOT NULL,
  phone        TEXT    NOT NULL,
  address      TEXT    NOT NULL,
  relationship TEXT    NOT NULL,
  idDocKey     TEXT,                          -- R2 object key for guarantor ID
  idDocUrl     TEXT,                          -- Signed R2 URL for guarantor ID
  createdAt    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_guarantors_rider
  ON guarantors(tenantId, riderId);

-- ════════════════════════════════════════════════════════════════════════════
-- Record this migration
-- ════════════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES ('004_rider_kyc', strftime('%s', 'now'));
