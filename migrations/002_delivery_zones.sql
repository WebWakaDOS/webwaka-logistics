-- ════════════════════════════════════════════════════════════════════════════
-- Migration 002: Delivery Zones (T-CVC-01)
--
-- Centralises the delivery_zones table from webwaka-commerce (single-vendor
-- and multi-vendor) into the Logistics suite.
--
-- Invariant: Build Once, Use Infinitely — this is now the single source of
-- truth for all delivery zone pricing across the WebWaka platform.
--
-- Nigeria-First: state names match NIPOST/NBS naming convention.
-- Multi-Tenant: all rows are scoped by tenant_id.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS delivery_zones (
  id                   TEXT    PRIMARY KEY,          -- dz_{ts}_{rand}
  tenant_id            TEXT    NOT NULL,
  vendor_id            TEXT,                         -- NULL = tenant-wide zone (single-vendor)
  state                TEXT    NOT NULL,             -- e.g. 'Lagos', 'Abuja FCT', 'Kano', 'Rivers'
  lga                  TEXT,                         -- LGA for granular rates (NULL = entire state)
  base_fee             INTEGER NOT NULL DEFAULT 0,   -- kobo
  per_kg_fee           INTEGER NOT NULL DEFAULT 0,   -- kobo per kg
  free_above           INTEGER,                      -- kobo: free delivery when order_value >= this
  is_active            INTEGER NOT NULL DEFAULT 1,
  estimated_days_min   INTEGER NOT NULL DEFAULT 1,
  estimated_days_max   INTEGER NOT NULL DEFAULT 3,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  UNIQUE(tenant_id, vendor_id, state, lga)           -- one zone per tenant/vendor/state/LGA
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_tenant_state
  ON delivery_zones(tenant_id, state, is_active);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_vendor
  ON delivery_zones(tenant_id, vendor_id, state, is_active);

-- ════════════════════════════════════════════════════════════════════════════
-- Record this migration
-- ════════════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES ('002_delivery_zones', strftime('%s', 'now'));
