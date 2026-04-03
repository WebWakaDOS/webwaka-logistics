-- ════════════════════════════════════════════════════════════════════════════
-- Migration 003: Order Tracking (T-CVC-02)
--
-- Centralises order tracking from webwaka-commerce into the Logistics suite.
-- Commerce emits `delivery.status_changed` events; Logistics consumes them
-- and persists the canonical tracking record here.
--
-- Invariants:
--   - Build Once, Use Infinitely: single source of truth for order tracking
--   - Multi-Tenant: all rows scoped by (orderId, tenantId)
--   - Secure: tracking_tokens are HMAC-signed with 7-day TTL
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- ORDER TRACKING
-- Canonical tracking record for every order dispatched to Logistics.
-- Upserted on every `delivery.status_changed` event.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_tracking (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId          TEXT    NOT NULL,
  tenantId         TEXT    NOT NULL,
  sourceModule     TEXT    NOT NULL DEFAULT 'commerce', -- 'single-vendor' | 'multi-vendor' | 'commerce'
  status           TEXT    NOT NULL DEFAULT 'PENDING',  -- mirrors delivery_requests.status
  provider         TEXT,                                -- assigned logistics provider slug
  trackingUrl      TEXT,                                -- provider-issued external tracking URL
  estimatedDelivery TEXT,                               -- ISO-8601 date string or human-readable ETA
  notes            TEXT,                                -- free-form status notes
  statusHistory    TEXT    NOT NULL DEFAULT '[]',       -- JSON array of {status, timestamp, provider?, notes?}
  createdAt        INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(orderId, tenantId)                             -- one tracking record per order per tenant
);

CREATE INDEX IF NOT EXISTS idx_order_tracking_tenant
  ON order_tracking(tenantId, status);

CREATE INDEX IF NOT EXISTS idx_order_tracking_order
  ON order_tracking(orderId);

-- ────────────────────────────────────────────────────────────────────────────
-- TRACKING TOKENS
-- Short-lived HMAC-signed tokens issued by Logistics to Commerce so that
-- Commerce can redirect customers to the Logistics tracking portal securely.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token        TEXT    NOT NULL UNIQUE,  -- base64url(orderId:tenantId:expiresAt).hmac
  orderId      TEXT    NOT NULL,
  tenantId     TEXT    NOT NULL,
  sourceModule TEXT    NOT NULL DEFAULT 'commerce',
  expiresAt    INTEGER NOT NULL,         -- Unix epoch seconds
  createdAt    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tracking_tokens_order
  ON tracking_tokens(orderId, tenantId);

CREATE INDEX IF NOT EXISTS idx_tracking_tokens_expires
  ON tracking_tokens(expiresAt);

-- ════════════════════════════════════════════════════════════════════════════
-- Record this migration
-- ════════════════════════════════════════════════════════════════════════════
INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES ('003_order_tracking', strftime('%s', 'now'));
