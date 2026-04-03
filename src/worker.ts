/**
 * WebWaka Logistics Suite — Cloudflare Worker Entry Point
 *
 * Implements the full logistics API surface as a Hono-based Cloudflare Worker.
 * Replaces the Express/Node.js server with a Worker-native implementation.
 *
 * Architecture:
 *   - D1 for persistent storage (parcels, delivery_requests, users)
 *   - KV (SESSIONS_KV) for JWT session cache
 *   - KV (EVENTS) for outbound event queue
 *   - R2 (STORAGE) for proof-of-delivery images/signatures
 *   - @webwaka/core for JWT auth, CORS, rate limiting
 *
 * Public routes (no JWT required):
 *   GET  /health
 *   GET  /api/parcels/track/:trackingNumber
 *   POST /api/webhooks/gig
 *   POST /api/webhooks/kwik
 *   POST /api/webhooks/sendbox
 *   POST /api/events/commerce
 *
 * Invariants: Nigeria-First, Multi-Tenant, NDPR, Build Once Use Infinitely
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwtAuthMiddleware, requireRole, secureCORS, rateLimit, getTenantId, getAuthUser } from '@webwaka/core';

// ============================================================
// Environment Bindings
// ============================================================
export interface Env {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  EVENTS: KVNamespace;
  STORAGE: R2Bucket;
  JWT_SECRET?: string;
  INTER_SERVICE_SECRET?: string;
  TRANSPORT_BASE_URL?: string;
  COMMERCE_EVENTS_URL?: string;
  GIG_WEBHOOK_SECRET?: string;
  KWIK_WEBHOOK_SECRET?: string;
  SENDBOX_WEBHOOK_SECRET?: string;
  ENVIRONMENT?: string;
  TRACKING_SECRET?: string;       // HMAC-SHA256 secret for signing tracking tokens (T-CVC-02)
  LOGISTICS_PORTAL_URL?: string;  // Public URL of the Logistics tracking portal (T-CVC-02)
}

// ============================================================
// Logger (Workers-compatible — no process.stdout)
// ============================================================
function log(level: 'INFO' | 'WARN' | 'ERROR', module: string, message: string, data?: unknown): void {
  const entry = {
    level,
    module,
    message,
    ...(data !== undefined ? { data } : {}),
    timestamp: new Date().toISOString(),
  };
  // Workers-approved output: console methods map to structured logs in CF dashboard
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ============================================================
// Tracking Number Generator
// ============================================================
function generateTrackingNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  let suffix = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (const byte of array) {
    suffix += chars[byte % chars.length];
  }
  return `WW-${date}-${suffix}`;
}

// ============================================================
// nanoid-compatible ID generator (Workers-native)
// ============================================================
function genId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  let id = '';
  for (const byte of array) {
    id += chars[byte % chars.length];
  }
  return `${prefix}_${id}`;
}

// ============================================================
// D1 Helpers
// ============================================================
async function runMigrations(db: D1Database): Promise<void> {
  const MIGRATION_SQL = `
    CREATE TABLE IF NOT EXISTS users (
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
    CREATE TABLE IF NOT EXISTS parcels (
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
      createdById INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS parcel_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenantId TEXT NOT NULL,
      parcelId INTEGER NOT NULL,
      status TEXT NOT NULL,
      location TEXT,
      latitude REAL,
      longitude REAL,
      notes TEXT,
      recordedById INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS proof_of_delivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenantId TEXT NOT NULL,
      parcelId INTEGER NOT NULL,
      imageUrl TEXT,
      imageKey TEXT,
      signatureUrl TEXT,
      signatureKey TEXT,
      receivedByName TEXT NOT NULL,
      receivedByRelation TEXT NOT NULL DEFAULT 'Self',
      capturedById INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      deletedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS delivery_requests (
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
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id                   TEXT    PRIMARY KEY,
      tenant_id            TEXT    NOT NULL,
      vendor_id            TEXT,
      state                TEXT    NOT NULL,
      lga                  TEXT,
      base_fee             INTEGER NOT NULL DEFAULT 0,
      per_kg_fee           INTEGER NOT NULL DEFAULT 0,
      free_above           INTEGER,
      is_active            INTEGER NOT NULL DEFAULT 1,
      estimated_days_min   INTEGER NOT NULL DEFAULT 1,
      estimated_days_max   INTEGER NOT NULL DEFAULT 3,
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL,
      UNIQUE(tenant_id, vendor_id, state, lga)
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_zones_tenant_state
      ON delivery_zones(tenant_id, state, is_active);
    CREATE INDEX IF NOT EXISTS idx_delivery_zones_vendor
      ON delivery_zones(tenant_id, vendor_id, state, is_active);
    CREATE TABLE IF NOT EXISTS order_tracking (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId       TEXT    NOT NULL,
      tenantId      TEXT    NOT NULL,
      sourceModule  TEXT    NOT NULL DEFAULT 'commerce',
      status        TEXT    NOT NULL DEFAULT 'PENDING',
      trackingUrl   TEXT,
      provider      TEXT,
      estimatedDelivery TEXT,
      notes         TEXT,
      statusHistory TEXT    NOT NULL DEFAULT '[]',
      createdAt     INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt     INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(orderId, tenantId)
    );
    CREATE INDEX IF NOT EXISTS idx_order_tracking_tenant
      ON order_tracking(tenantId, orderId);
    CREATE TABLE IF NOT EXISTS tracking_tokens (
      token         TEXT    PRIMARY KEY,
      orderId       TEXT    NOT NULL,
      tenantId      TEXT    NOT NULL,
      sourceModule  TEXT    NOT NULL DEFAULT 'commerce',
      expiresAt     INTEGER NOT NULL,
      createdAt     INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_tracking_tokens_order
      ON tracking_tokens(orderId, tenantId);
  `;
  try {
    // D1 batch for multi-statement DDL
    const statements = MIGRATION_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => db.prepare(s));
    await db.batch(statements);
    log('INFO', 'Migrations', 'Schema migrations applied successfully');
  } catch (err) {
    log('WARN', 'Migrations', 'Migration batch warning (tables may already exist)', { err: String(err) });
  }
}

// ============================================================
// Provider Quote Engine
// ============================================================
interface DeliveryAddress { city: string; state?: string; }
interface ProviderQuote {
  provider: string;
  providerName: string;
  etaHours: number;
  feeKobo: number;
  trackingSupported: boolean;
}

function getProviderQuotes(
  pickup: DeliveryAddress,
  delivery: DeliveryAddress,
  weightKg: number,
  preferredProviders?: string[],
): ProviderQuote[] {
  const isSameCity = pickup.city.toLowerCase() === delivery.city.toLowerCase();
  const quotes: ProviderQuote[] = [];

  const providers = [
    {
      id: 'gig', name: 'GIG Logistics', tracking: true,
      quote: () => ({
        feeKobo: (isSameCity ? 150000 : 350000) + Math.round(weightKg * 20000),
        etaHours: isSameCity ? 4 : 48,
      }),
    },
    {
      id: 'kwik', name: 'Kwik Delivery', tracking: true,
      quote: () => isSameCity
        ? { feeKobo: 120000 + Math.round(weightKg * 15000), etaHours: 2 }
        : null,
    },
    {
      id: 'sendbox', name: 'Sendbox', tracking: true,
      quote: () => ({
        feeKobo: isSameCity ? 130000 : 400000 + Math.round(weightKg * 18000),
        etaHours: isSameCity ? 6 : 72,
      }),
    },
    {
      id: 'errand_boy', name: 'Errand Boy', tracking: false,
      quote: () => isSameCity
        ? { feeKobo: 80000 + Math.round(weightKg * 10000), etaHours: 3 }
        : null,
    },
  ];

  for (const p of providers) {
    if (preferredProviders && preferredProviders.length > 0 && !preferredProviders.includes(p.id)) continue;
    const q = p.quote();
    if (q) {
      quotes.push({ provider: p.id, providerName: p.name, etaHours: q.etaHours, feeKobo: q.feeKobo, trackingSupported: p.tracking });
    }
  }
  return quotes.sort((a, b) => a.feeKobo - b.feeKobo);
}

// ============================================================
// Event Publisher (KV-backed outbox)
// Unified WebWakaEvent schema: event, tenantId, payload, timestamp
// Ref: EVENT_BUS_SCHEMA.md in webwaka-platform-docs
// ============================================================

/**
 * Unified WebWaka Platform Event Bus Schema (Governance-Mandated).
 * Strictly conforms to the standard WebWakaEvent<T> shape:
 *   event (string), tenantId (string), payload (T), timestamp (number)
 *
 * Legacy fields (publishedAt, type) have been replaced.
 * tenantId is extracted from the payload and hoisted to the top level.
 */
interface WebWakaEvent {
  event: string;
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

async function publishEvent(env: Env, eventType: string, payload: Record<string, unknown>): Promise<void> {
  // Extract tenantId from payload (required by unified schema)
  const tenantId = (payload.tenantId as string | undefined) ?? 'unknown';
  const event: WebWakaEvent = {
    event: eventType,
    tenantId,
    payload,
    timestamp: Date.now(),
  };
  const key = `event:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    await env.EVENTS.put(key, JSON.stringify(event), { expirationTtl: 86400 });
    log('INFO', 'EventBus', `Event queued: ${eventType}`, { key, tenantId });
  } catch (err) {
    log('WARN', 'EventBus', `Failed to queue event: ${eventType}`, { err: String(err) });
  }
  // Also forward to COMMERCE_EVENTS_URL if configured
  if (env.COMMERCE_EVENTS_URL) {
    try {
      await fetch(env.COMMERCE_EVENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      log('WARN', 'EventBus', `HTTP delivery failed for ${eventType}`, { err: String(err) });
    }
  }
}

// ============================================================
// Webhook signature verifiers
// ============================================================
function verifyGigSig(req: Request, secret?: string): boolean {
  if (!secret) return true;
  return req.headers.get('x-gig-signature') === secret;
}
function verifyKwikSig(req: Request, secret?: string): boolean {
  if (!secret) return true;
  return req.headers.get('x-kwik-token') === secret;
}
function verifySendboxSig(req: Request, secret?: string): boolean {
  if (!secret) return true;
  return req.headers.get('x-sendbox-webhook-secret') === secret;
}

// ============================================================
// Provider status maps
// ============================================================
const GIG_STATUS_MAP: Record<string, string> = {
  SHIPMENT_CREATED: 'PENDING', PICKED_UP: 'PICKED_UP', IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY', DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'FAILED', RETURNED_TO_SENDER: 'RETURNED',
};
const KWIK_STATUS_MAP: Record<string, string> = {
  pending: 'PENDING', assigned: 'PENDING', picked_up: 'PICKED_UP',
  on_the_way: 'IN_TRANSIT', nearby: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED', cancelled: 'FAILED', returned: 'RETURNED',
};
const SENDBOX_STATUS_MAP: Record<string, string> = {
  SHIPMENT_CREATED: 'PENDING', PROCESSING: 'PENDING', PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT', OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED', DELIVERY_ATTEMPTED: 'FAILED', RETURNED: 'RETURNED',
};

// ============================================================
// App
// ============================================================
const app = new Hono<{ Bindings: Env }>();

// CORS — allowlist only (SEC-001)
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  const allowed = [
    'https://webwaka-logistics-ui.pages.dev',
    'https://webwaka-super-admin-v2.pages.dev',
    'http://localhost:5173',
    'http://localhost:3000',
  ];
  const isAllowed = allowed.some(o => origin === o || origin.endsWith('.webwaka.workers.dev') || origin.endsWith('.pages.dev'));
  if (isAllowed) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  if (c.req.method === 'OPTIONS') return c.text('', 204);
  await next();
});

// ============================================================
// Health
// ============================================================
app.get('/health', (c) => c.json({ ok: true, service: 'webwaka-logistics-api', ts: Date.now() }));

// ============================================================
// Admin: Run Migrations
// ============================================================
app.post('/api/admin/migrations/run', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secret = c.env.JWT_SECRET ?? '';
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  await runMigrations(c.env.DB);
  return c.json({ success: true, message: 'Migrations applied' });
});

// ============================================================
// JWT Auth Middleware (applied to all /api/* except public routes)
// ============================================================
const PUBLIC_ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/api/parcels/track' },
  { method: 'POST', path: '/api/webhooks/gig' },
  { method: 'POST', path: '/api/webhooks/kwik' },
  { method: 'POST', path: '/api/webhooks/sendbox' },
  { method: 'POST', path: '/api/events/commerce' },
  { method: 'POST', path: '/internal/transport-events' },
  { method: 'POST', path: '/api/admin/migrations/run' },
  // T-CVC-01: Delivery zones are public — Commerce checkout queries these without JWT
  { method: 'GET', path: '/api/delivery-zones' },
  { method: 'GET', path: '/api/delivery-zones/estimate' },
  // T-CVC-02: Public order tracking — buyer tracking via signed token
  { method: 'GET', path: '/api/orders/track' },
];

app.use('/api/*', async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const isPublic = PUBLIC_ROUTES.some(r =>
    r.method === method && (r.path === path || path.startsWith(r.path + '/') || path.startsWith(r.path + '?'))
  );
  if (isPublic) { await next(); return; }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing authorization token' }, 401);
  }
  const token = authHeader.slice(7);
  const secret = c.env.JWT_SECRET;
  if (!secret) return c.json({ success: false, error: 'Auth not configured' }, 503);

  // Verify JWT using Web Crypto (Workers-native)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const [headerB64, payloadB64, sigB64] = parts;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
    if (!valid) throw new Error('Invalid signature');
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
    c.set('user' as never, payload as never);
    await next();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
});

// ============================================================
// Parcels API
// ============================================================

// POST /api/parcels — create parcel
app.post('/api/parcels', async (c) => {
  const user = c.get('user' as never) as Record<string, unknown> | undefined;
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const required = ['tenantId', 'senderName', 'senderPhone', 'senderAddress', 'recipientName', 'recipientPhone', 'recipientAddress', 'recipientCity', 'recipientState'];
  for (const f of required) {
    if (!body[f] || typeof body[f] !== 'string') return c.json({ success: false, error: `${f} is required` }, 400);
  }

  const trackingNumber = generateTrackingNumber();
  const now = Math.floor(Date.now() / 1000);
  const userId = (user as Record<string, unknown>)?.id ?? 0;

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO parcels (tenantId, trackingNumber, status, priority, senderName, senderPhone, senderAddress,
        recipientName, recipientPhone, recipientAddress, recipientCity, recipientState,
        description, weightGrams, deliveryFeeKobo, insuranceValueKobo, currency,
        createdById, estimatedDeliveryAt, clientId, createdAt, updatedAt)
      VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.tenantId, trackingNumber,
      body.priority ?? 'STANDARD',
      body.senderName, body.senderPhone, body.senderAddress,
      body.recipientName, body.recipientPhone, body.recipientAddress,
      body.recipientCity, body.recipientState,
      body.description ?? null,
      body.weightGrams ?? 0, body.deliveryFeeKobo ?? 0, body.insuranceValueKobo ?? 0,
      body.currency ?? 'NGN',
      userId,
      body.estimatedDeliveryAt ?? null,
      body.clientId ?? null,
      now, now,
    ).run();

    const parcel = await c.env.DB.prepare('SELECT * FROM parcels WHERE trackingNumber = ? LIMIT 1').bind(trackingNumber).first();

    // Record initial status update
    await c.env.DB.prepare(`
      INSERT INTO parcel_updates (tenantId, parcelId, status, notes, recordedById, createdAt)
      VALUES (?, ?, 'PENDING', 'Parcel created and awaiting collection', ?, ?)
    `).bind(body.tenantId, (parcel as Record<string, unknown>)?.id ?? 0, userId, now).run();

    // Publish event
    await publishEvent(c.env, 'parcel.created', {
      tenantId: body.tenantId, parcelId: (parcel as Record<string, unknown>)?.id,
      trackingNumber, priority: body.priority ?? 'STANDARD',
    });

    log('INFO', 'Parcels', 'Parcel created', { tenantId: body.tenantId, trackingNumber });
    return c.json({ success: true, data: parcel });
  } catch (err) {
    log('ERROR', 'Parcels', 'Failed to create parcel', { err: String(err) });
    return c.json({ success: false, error: 'Failed to create parcel' }, 500);
  }
});

// GET /api/parcels — list parcels for tenant
app.get('/api/parcels', async (c) => {
  const tenantId = c.req.query('tenantId');
  if (!tenantId) return c.json({ success: false, error: 'tenantId is required' }, 400);
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM parcels WHERE tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT ? OFFSET ?'
    ).bind(tenantId, limit, offset).all();
    return c.json({ success: true, data: results });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to list parcels' }, 500);
  }
});

// GET /api/parcels/search — search by tracking number fragment
app.get('/api/parcels/search', async (c) => {
  const tenantId = c.req.query('tenantId');
  const query = c.req.query('q');
  if (!tenantId || !query) return c.json({ success: false, error: 'tenantId and q are required' }, 400);
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM parcels WHERE tenantId = ? AND deletedAt IS NULL AND trackingNumber LIKE ? LIMIT 20'
    ).bind(tenantId, `%${query}%`).all();
    return c.json({ success: true, data: results });
  } catch (err) {
    return c.json({ success: false, error: 'Search failed' }, 500);
  }
});

// GET /api/parcels/track/:trackingNumber — public customer tracking
app.get('/api/parcels/track/:trackingNumber', async (c) => {
  const trackingNumber = c.req.param('trackingNumber');
  try {
    const parcel = await c.env.DB.prepare(
      'SELECT id, trackingNumber, status, priority, recipientCity, recipientState, estimatedDeliveryAt, actualDeliveryAt, createdAt FROM parcels WHERE trackingNumber = ? AND deletedAt IS NULL LIMIT 1'
    ).bind(trackingNumber).first();
    if (!parcel) return c.json({ success: false, error: 'Parcel not found' }, 404);
    const { results: updates } = await c.env.DB.prepare(
      'SELECT status, location, notes, createdAt FROM parcel_updates WHERE parcelId = ? ORDER BY createdAt DESC'
    ).bind((parcel as Record<string, unknown>).id).all();
    return c.json({ success: true, data: { parcel, updates } });
  } catch (err) {
    return c.json({ success: false, error: 'Tracking lookup failed' }, 500);
  }
});

// GET /api/parcels/:id — get parcel by ID (authenticated)
app.get('/api/parcels/:id', async (c) => {
  const tenantId = c.req.query('tenantId');
  const id = parseInt(c.req.param('id'));
  if (!tenantId) return c.json({ success: false, error: 'tenantId is required' }, 400);
  try {
    const parcel = await c.env.DB.prepare(
      'SELECT * FROM parcels WHERE id = ? AND tenantId = ? AND deletedAt IS NULL LIMIT 1'
    ).bind(id, tenantId).first();
    if (!parcel) return c.json({ success: false, error: 'Parcel not found' }, 404);
    const { results: updates } = await c.env.DB.prepare(
      'SELECT * FROM parcel_updates WHERE parcelId = ? ORDER BY createdAt DESC'
    ).bind(id).all();
    const pod = await c.env.DB.prepare(
      'SELECT * FROM proof_of_delivery WHERE parcelId = ? AND tenantId = ? AND deletedAt IS NULL LIMIT 1'
    ).bind(id, tenantId).first();
    return c.json({ success: true, data: { parcel, updates, pod } });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to fetch parcel' }, 500);
  }
});

// PATCH /api/parcels/:id/status — update parcel status
app.patch('/api/parcels/:id/status', async (c) => {
  const user = c.get('user' as never) as Record<string, unknown> | undefined;
  const id = parseInt(c.req.param('id'));
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const { tenantId, status, location, latitude, longitude, notes } = body as Record<string, string>;
  if (!tenantId || !status) return c.json({ success: false, error: 'tenantId and status are required' }, 400);

  const now = Math.floor(Date.now() / 1000);
  const userId = (user as Record<string, unknown>)?.id ?? 0;
  try {
    await c.env.DB.prepare(
      'UPDATE parcels SET status = ?, updatedAt = ? WHERE id = ? AND tenantId = ?'
    ).bind(status, now, id, tenantId).run();

    await c.env.DB.prepare(
      'INSERT INTO parcel_updates (tenantId, parcelId, status, location, latitude, longitude, notes, recordedById, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(tenantId, id, status, location ?? null, latitude ?? null, longitude ?? null, notes ?? null, userId, now).run();

    await publishEvent(c.env, 'parcel.status_updated', { tenantId, parcelId: id, status });
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to update status' }, 500);
  }
});

// POST /api/parcels/:id/pod — capture proof of delivery
app.post('/api/parcels/:id/pod', async (c) => {
  const user = c.get('user' as never) as Record<string, unknown> | undefined;
  const id = parseInt(c.req.param('id'));
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  const { tenantId, receivedByName, receivedByRelation, imageBase64, signatureBase64 } = body as Record<string, string>;
  if (!tenantId || !receivedByName) return c.json({ success: false, error: 'tenantId and receivedByName are required' }, 400);

  const now = Math.floor(Date.now() / 1000);
  const userId = (user as Record<string, unknown>)?.id ?? 0;

  let imageUrl: string | null = null;
  let imageKey: string | null = null;
  let signatureUrl: string | null = null;
  let signatureKey: string | null = null;

  // Upload to R2 if STORAGE is available
  if (imageBase64 && c.env.STORAGE) {
    try {
      const imageBytes = Uint8Array.from(atob(imageBase64), ch => ch.charCodeAt(0));
      imageKey = `pod/${tenantId}/${id}/photo-${now}.jpg`;
      await c.env.STORAGE.put(imageKey, imageBytes, { httpMetadata: { contentType: 'image/jpeg' } });
      imageUrl = `https://storage.webwaka.workers.dev/${imageKey}`;
    } catch (err) {
      log('WARN', 'POD', 'Failed to upload delivery photo', { err: String(err) });
    }
  }
  if (signatureBase64 && c.env.STORAGE) {
    try {
      const sigBytes = Uint8Array.from(atob(signatureBase64), ch => ch.charCodeAt(0));
      signatureKey = `pod/${tenantId}/${id}/signature-${now}.png`;
      await c.env.STORAGE.put(signatureKey, sigBytes, { httpMetadata: { contentType: 'image/png' } });
      signatureUrl = `https://storage.webwaka.workers.dev/${signatureKey}`;
    } catch (err) {
      log('WARN', 'POD', 'Failed to upload signature', { err: String(err) });
    }
  }

  try {
    await c.env.DB.prepare(`
      INSERT INTO proof_of_delivery (tenantId, parcelId, imageUrl, imageKey, signatureUrl, signatureKey, receivedByName, receivedByRelation, capturedById, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tenantId, id, imageUrl, imageKey, signatureUrl, signatureKey, receivedByName, receivedByRelation ?? 'Self', userId, now).run();

    await c.env.DB.prepare(
      'UPDATE parcels SET status = ?, actualDeliveryAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?'
    ).bind('DELIVERED', now, now, id, tenantId).run();

    await c.env.DB.prepare(
      'INSERT INTO parcel_updates (tenantId, parcelId, status, notes, recordedById, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(tenantId, id, 'DELIVERED', `Delivered to ${receivedByName} (${receivedByRelation ?? 'Self'})`, userId, now).run();

    const pod = await c.env.DB.prepare(
      'SELECT * FROM proof_of_delivery WHERE parcelId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1'
    ).bind(id, tenantId).first();

    await publishEvent(c.env, 'parcel.delivered', { tenantId, parcelId: id, receivedByName });
    return c.json({ success: true, data: pod });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to record proof of delivery' }, 500);
  }
});

// DELETE /api/parcels/:id — soft delete
app.delete('/api/parcels/:id', async (c) => {
  const tenantId = c.req.query('tenantId');
  const id = parseInt(c.req.param('id'));
  if (!tenantId) return c.json({ success: false, error: 'tenantId is required' }, 400);
  const now = Math.floor(Date.now() / 1000);
  try {
    await c.env.DB.prepare(
      'UPDATE parcels SET deletedAt = ? WHERE id = ? AND tenantId = ?'
    ).bind(now, id, tenantId).run();
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to delete parcel' }, 500);
  }
});

// ============================================================
// Delivery Requests API (P04)
// ============================================================

// GET /api/delivery-requests/:orderId
app.get('/api/delivery-requests/:orderId', async (c) => {
  const orderId = c.req.param('orderId');
  try {
    const req = await c.env.DB.prepare(
      'SELECT * FROM delivery_requests WHERE orderId = ? LIMIT 1'
    ).bind(orderId).first();
    if (!req) return c.json({ success: false, error: 'Delivery request not found' }, 404);
    return c.json({ success: true, data: req });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to fetch delivery request' }, 500);
  }
});

// PATCH /api/delivery-requests/:orderId/assign
app.patch('/api/delivery-requests/:orderId/assign', async (c) => {
  const orderId = c.req.param('orderId');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }
  const { provider } = body as { provider?: string };
  if (!provider) return c.json({ success: false, error: 'provider is required' }, 400);

  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await c.env.DB.prepare('SELECT * FROM delivery_requests WHERE orderId = ? LIMIT 1').bind(orderId).first() as Record<string, unknown> | null;
    if (!existing) return c.json({ success: false, error: 'Delivery request not found' }, 404);
    if (existing.status === 'DELIVERED' || existing.status === 'CANCELLED') {
      return c.json({ success: false, error: `Cannot assign — request is already ${existing.status}` }, 400);
    }
    await c.env.DB.prepare(
      'UPDATE delivery_requests SET status = ?, assignedProvider = ?, updatedAt = ? WHERE orderId = ?'
    ).bind('ASSIGNED', provider, now, orderId).run();
    return c.json({ success: true, orderId, assignedProvider: provider });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to assign provider' }, 500);
  }
});

// PATCH /api/delivery-requests/:orderId/cancel
app.patch('/api/delivery-requests/:orderId/cancel', async (c) => {
  const orderId = c.req.param('orderId');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }
  const { reason } = body as { reason?: string };

  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await c.env.DB.prepare('SELECT * FROM delivery_requests WHERE orderId = ? LIMIT 1').bind(orderId).first() as Record<string, unknown> | null;
    if (!existing) return c.json({ success: false, error: 'Delivery request not found' }, 404);
    if (existing.status === 'DELIVERED' || existing.status === 'CANCELLED') {
      return c.json({ success: false, error: `Cannot cancel — request is already ${existing.status}` }, 400);
    }
    await c.env.DB.prepare(
      'UPDATE delivery_requests SET status = ?, updatedAt = ? WHERE orderId = ?'
    ).bind('CANCELLED', now, orderId).run();
    await publishEvent(c.env, 'delivery.status_changed', {
      orderId, tenantId: existing.tenantId,
      deliveryId: existing.internalDeliveryId ?? orderId,
      provider: existing.assignedProvider ?? 'unknown',
      status: 'FAILED',
      notes: reason ?? 'Delivery cancelled by logistics team',
    });
    return c.json({ success: true, orderId, status: 'CANCELLED' });
  } catch (err) {
    return c.json({ success: false, error: 'Failed to cancel delivery request' }, 500);
  }
});

// ============================================================
// Delivery Zones API (T-CVC-01)
// Centralised delivery zone management — extracted from webwaka-commerce.
// Single source of truth for all platform delivery zone pricing.
// GET  /api/delivery-zones          — list zones (tenant-scoped)
// POST /api/delivery-zones          — create/update zone (admin only)
// GET  /api/delivery-zones/estimate — shipping fee estimate (public)
// ============================================================

/** Nigeria states — NIPOST/NBS naming convention (Nigeria-First invariant) */
const NIGERIA_STATES = new Set([
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'Abuja FCT',
]);

/**
 * GET /api/delivery-zones
 * Returns active delivery zones for the requesting tenant.
 * Query params: vendor_id? (filter by vendor), state? (filter by state)
 * Public: no JWT required — Commerce checkout needs this without auth context.
 */
app.get('/api/delivery-zones', async (c) => {
  const tenantId = c.req.header('x-tenant-id');
  if (!tenantId) return c.json({ success: false, error: 'x-tenant-id header is required' }, 400);
  const vendorId = c.req.query('vendor_id');
  const state = c.req.query('state');
  try {
    let query: string;
    let bindings: unknown[];
    if (vendorId && state) {
      query = `SELECT id, vendor_id, state, lga, base_fee, per_kg_fee, free_above,
                      estimated_days_min, estimated_days_max, is_active
               FROM delivery_zones
               WHERE tenant_id = ? AND vendor_id = ? AND state = ? AND is_active = 1
               ORDER BY state ASC, lga ASC`;
      bindings = [tenantId, vendorId, state];
    } else if (vendorId) {
      query = `SELECT id, vendor_id, state, lga, base_fee, per_kg_fee, free_above,
                      estimated_days_min, estimated_days_max, is_active
               FROM delivery_zones
               WHERE tenant_id = ? AND vendor_id = ? AND is_active = 1
               ORDER BY state ASC, lga ASC`;
      bindings = [tenantId, vendorId];
    } else if (state) {
      query = `SELECT id, vendor_id, state, lga, base_fee, per_kg_fee, free_above,
                      estimated_days_min, estimated_days_max, is_active
               FROM delivery_zones
               WHERE tenant_id = ? AND (vendor_id IS NULL OR vendor_id = '') AND state = ? AND is_active = 1
               ORDER BY lga ASC`;
      bindings = [tenantId, state];
    } else {
      query = `SELECT id, vendor_id, state, lga, base_fee, per_kg_fee, free_above,
                      estimated_days_min, estimated_days_max, is_active
               FROM delivery_zones
               WHERE tenant_id = ? AND is_active = 1
               ORDER BY state ASC, lga ASC`;
      bindings = [tenantId];
    }
    const stmt = c.env.DB.prepare(query);
    // Bind all parameters sequentially
    let bound: D1PreparedStatement = stmt;
    for (const b of bindings) {
      bound = bound.bind(b);
    }
    const { results } = await bound.all();
    return c.json({ success: true, data: { zones: results, count: results.length } });
  } catch (err) {
    log('ERROR', 'DeliveryZones', 'GET /api/delivery-zones failed', { err: String(err) });
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/delivery-zones
 * Create or update a delivery zone.
 * Requires JWT with role SUPER_ADMIN, TENANT_ADMIN, or admin.
 * Body: { vendor_id?, state, lga?, base_fee, per_kg_fee?, free_above?,
 *         estimated_days_min?, estimated_days_max?, is_active? }
 */
app.post('/api/delivery-zones', async (c) => {
  const tenantId = c.req.header('x-tenant-id');
  if (!tenantId) return c.json({ success: false, error: 'x-tenant-id header is required' }, 400);
  const user = c.get('user' as never) as Record<string, unknown> | undefined;
  const role = (user?.role ?? '') as string;
  if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'admin'].includes(role)) {
    return c.json({ success: false, error: 'Forbidden: admin role required' }, 403);
  }
  let body: {
    vendor_id?: string; state: string; lga?: string;
    base_fee: number; per_kg_fee?: number; free_above?: number;
    estimated_days_min?: number; estimated_days_max?: number; is_active?: boolean;
  };
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }
  if (!body.state?.trim()) return c.json({ success: false, error: 'state is required' }, 400);
  if (!NIGERIA_STATES.has(body.state.trim())) {
    return c.json({ success: false, error: `Invalid Nigerian state: ${body.state}` }, 400);
  }
  if (typeof body.base_fee !== 'number' || body.base_fee < 0) {
    return c.json({ success: false, error: 'base_fee must be a non-negative number (kobo)' }, 400);
  }
  const now = Date.now();
  const dzId = `dz_${now}_${Math.random().toString(36).slice(2, 9)}`;
  const vendorId = body.vendor_id?.trim() ?? null;
  try {
    await c.env.DB.prepare(
      `INSERT INTO delivery_zones
         (id, tenant_id, vendor_id, state, lga, base_fee, per_kg_fee, free_above,
          is_active, estimated_days_min, estimated_days_max, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, vendor_id, state, lga)
       DO UPDATE SET base_fee=excluded.base_fee, per_kg_fee=excluded.per_kg_fee,
                     free_above=excluded.free_above, is_active=excluded.is_active,
                     estimated_days_min=excluded.estimated_days_min,
                     estimated_days_max=excluded.estimated_days_max,
                     updated_at=excluded.updated_at`
    ).bind(
      dzId, tenantId, vendorId, body.state.trim(), body.lga?.trim() ?? null,
      body.base_fee, body.per_kg_fee ?? 0, body.free_above ?? null,
      body.is_active !== false ? 1 : 0,
      body.estimated_days_min ?? 1, body.estimated_days_max ?? 3,
      now, now,
    ).run();
    log('INFO', 'DeliveryZones', 'Zone created/updated', { tenantId, state: body.state, vendorId });
    return c.json({
      success: true,
      data: { id: dzId, vendor_id: vendorId, state: body.state, lga: body.lga ?? null, base_fee: body.base_fee },
    }, 201);
  } catch (err) {
    log('ERROR', 'DeliveryZones', 'POST /api/delivery-zones failed', { err: String(err) });
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/delivery-zones/estimate
 * Calculate shipping fee for a given vendor, state, LGA, order value, and weight.
 * Query params: vendor_id?, state (required), lga?, order_value?, weight_kg?
 * Public: no JWT required.
 */
app.get('/api/delivery-zones/estimate', async (c) => {
  const tenantId = c.req.header('x-tenant-id');
  if (!tenantId) return c.json({ success: false, error: 'x-tenant-id header is required' }, 400);
  const vendorId = c.req.query('vendor_id');
  const state = c.req.query('state')?.trim();
  const lga = c.req.query('lga')?.trim();
  // Clamp to non-negative values to prevent fee manipulation via negative inputs (T-CVC-01 QA)
  const orderValue = Math.max(0, Number(c.req.query('order_value') ?? '0') || 0);
  const weightKg = Math.max(0, Number(c.req.query('weight_kg') ?? '0') || 0);
  if (!state) return c.json({ success: false, error: 'state query param is required' }, 400);
  type ZoneRow = {
    base_fee: number; per_kg_fee: number; free_above: number | null;
    estimated_days_min: number; estimated_days_max: number;
  };
  try {
    let zone: ZoneRow | null = null;
    // 1. Try LGA-specific zone first
    if (lga) {
      if (vendorId) {
        zone = await c.env.DB.prepare(
          `SELECT base_fee, per_kg_fee, free_above, estimated_days_min, estimated_days_max
           FROM delivery_zones
           WHERE tenant_id=? AND vendor_id=? AND state=? AND lga=? AND is_active=1 LIMIT 1`
        ).bind(tenantId, vendorId, state, lga).first<ZoneRow>();
      } else {
        zone = await c.env.DB.prepare(
          `SELECT base_fee, per_kg_fee, free_above, estimated_days_min, estimated_days_max
           FROM delivery_zones
           WHERE tenant_id=? AND (vendor_id IS NULL OR vendor_id='') AND state=? AND lga=? AND is_active=1 LIMIT 1`
        ).bind(tenantId, state, lga).first<ZoneRow>();
      }
    }
    // 2. Fall back to state-level zone
    if (!zone) {
      if (vendorId) {
        zone = await c.env.DB.prepare(
          `SELECT base_fee, per_kg_fee, free_above, estimated_days_min, estimated_days_max
           FROM delivery_zones
           WHERE tenant_id=? AND vendor_id=? AND state=? AND (lga IS NULL OR lga='') AND is_active=1 LIMIT 1`
        ).bind(tenantId, vendorId, state).first<ZoneRow>();
      } else {
        zone = await c.env.DB.prepare(
          `SELECT base_fee, per_kg_fee, free_above, estimated_days_min, estimated_days_max
           FROM delivery_zones
           WHERE tenant_id=? AND (vendor_id IS NULL OR vendor_id='') AND state=? AND (lga IS NULL OR lga='') AND is_active=1 LIMIT 1`
        ).bind(tenantId, state).first<ZoneRow>();
      }
    }
    if (!zone) {
      return c.json({
        success: true,
        data: {
          vendor_id: vendorId ?? null, state, lga: lga ?? null,
          base_fee: 0, per_kg_fee: 0, weight_fee: 0, total_fee: 0,
          free_above: null, is_free: false,
          estimated_days_min: 1, estimated_days_max: 7,
          note: 'No delivery zone configured for this region',
        },
      });
    }
    const isFree = zone.free_above !== null && orderValue >= zone.free_above;
    const weightFee = Math.round(weightKg * zone.per_kg_fee);
    const totalFee = isFree ? 0 : zone.base_fee + weightFee;
    return c.json({
      success: true,
      data: {
        vendor_id: vendorId ?? null, state, lga: lga ?? null,
        base_fee: zone.base_fee, per_kg_fee: zone.per_kg_fee,
        weight_kg: weightKg, weight_fee: weightFee,
        free_above: zone.free_above,
        is_free: isFree, total_fee: totalFee,
        estimated_days_min: zone.estimated_days_min,
        estimated_days_max: zone.estimated_days_max,
      },
    });
  } catch (err) {
    log('ERROR', 'DeliveryZones', 'GET /api/delivery-zones/estimate failed', { err: String(err) });
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ============================================================
// Order Tracking Portal (T-CVC-02)
// Centralised real-time order tracking — extracted from webwaka-commerce.
// GET  /api/orders/track           — public tracking endpoint (token or orderId+tenantId)
// POST /internal/tracking-token   — generate a signed tracking token (Service Binding only)
// ============================================================

/** HMAC-SHA256 helpers (Workers SubtleCrypto — no Node.js crypto) */
async function signTrackingToken(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function verifyTrackingToken(secret: string, data: string, sig: string): Promise<boolean> {
  const expected = await signTrackingToken(secret, data);
  return expected === sig;
}

// POST /internal/tracking-token — generate a signed tracking token (Service Binding only)
app.post('/internal/tracking-token', async (c) => {
  // Validate inter-service secret
  const authHeader = c.req.header('Authorization');
  const secret = c.env.INTER_SERVICE_SECRET;
  if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const { orderId, tenantId, sourceModule } = body as Record<string, string>;
  if (!orderId || !tenantId) return c.json({ error: 'orderId and tenantId are required' }, 400);

  const trackingSecret = c.env.TRACKING_SECRET ?? c.env.INTER_SERVICE_SECRET ?? 'dev-tracking-secret';
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 7 * 24 * 60 * 60; // 7-day TTL

  // Token payload: orderId:tenantId:expiresAt
  const tokenData = `${orderId}:${tenantId}:${expiresAt}`;
  const sig = await signTrackingToken(trackingSecret, tokenData);
  const token = `${btoa(tokenData).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}.${sig}`;

  // Persist token for lookup
  try {
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO tracking_tokens (token, orderId, tenantId, sourceModule, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(token, orderId, tenantId, sourceModule ?? 'commerce', expiresAt, now).run();
  } catch (err) {
    log('WARN', 'TrackingToken', 'Failed to persist token', { err: String(err) });
  }

  const portalUrl = c.env.LOGISTICS_PORTAL_URL ?? 'https://logistics.webwaka.ng';
  const trackingUrl = `${portalUrl}/track?token=${encodeURIComponent(token)}`;

  log('INFO', 'TrackingToken', 'Token generated', { orderId, tenantId, expiresAt });
  return c.json({ success: true, data: { token, trackingUrl, expiresAt } });
});

// GET /api/orders/track — public order tracking (accepts ?token= or ?order_id=&tenant_id=)
app.get('/api/orders/track', async (c) => {
  const tokenParam = c.req.query('token');
  const orderIdParam = c.req.query('order_id');
  const tenantIdParam = c.req.query('tenant_id');

  let orderId: string | undefined;
  let tenantId: string | undefined;

  if (tokenParam) {
    // Validate signed token
    const trackingSecret = c.env.TRACKING_SECRET ?? c.env.INTER_SERVICE_SECRET ?? 'dev-tracking-secret';
    const parts = tokenParam.split('.');
    if (parts.length !== 2) return c.json({ success: false, error: 'Invalid tracking token' }, 400);

    let tokenData: string;
    try {
      tokenData = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return c.json({ success: false, error: 'Malformed tracking token' }, 400);
    }

    const valid = await verifyTrackingToken(trackingSecret, tokenData, parts[1]);
    if (!valid) return c.json({ success: false, error: 'Invalid or tampered tracking token' }, 401);

    const [oid, tid, expiresAtStr] = tokenData.split(':');
    const expiresAt = parseInt(expiresAtStr);
    if (Date.now() / 1000 > expiresAt) return c.json({ success: false, error: 'Tracking token has expired' }, 401);

    orderId = oid;
    tenantId = tid;
  } else if (orderIdParam && tenantIdParam) {
    // Direct lookup (for internal/admin use — no token required)
    orderId = orderIdParam;
    tenantId = tenantIdParam;
  } else {
    return c.json({ success: false, error: 'Either token or order_id+tenant_id is required' }, 400);
  }

  try {
    // Look up order tracking record
    const tracking = await c.env.DB.prepare(
      'SELECT * FROM order_tracking WHERE orderId = ? AND tenantId = ? LIMIT 1'
    ).bind(orderId, tenantId).first() as Record<string, unknown> | null;

    // Also look up the delivery request for provider/status details
    const deliveryReq = await c.env.DB.prepare(
      'SELECT status, assignedProvider, internalDeliveryId, updatedAt FROM delivery_requests WHERE orderId = ? LIMIT 1'
    ).bind(orderId).first() as Record<string, unknown> | null;

    if (!tracking && !deliveryReq) {
      return c.json({ success: false, error: 'Order not found or not yet dispatched to logistics' }, 404);
    }

    const statusHistory = tracking?.statusHistory
      ? JSON.parse(tracking.statusHistory as string)
      : [];

    return c.json({
      success: true,
      data: {
        orderId,
        tenantId,
        status: tracking?.status ?? deliveryReq?.status ?? 'PENDING',
        provider: tracking?.provider ?? deliveryReq?.assignedProvider ?? null,
        trackingUrl: tracking?.trackingUrl ?? null,
        estimatedDelivery: tracking?.estimatedDelivery ?? null,
        notes: tracking?.notes ?? null,
        statusHistory,
        lastUpdated: tracking?.updatedAt ?? deliveryReq?.updatedAt ?? null,
      },
    });
  } catch (err) {
    log('ERROR', 'OrderTracking', 'GET /api/orders/track failed', { err: String(err) });
    return c.json({ success: false, error: 'Tracking lookup failed' }, 500);
  }
});

// ============================================================
// Commerce Event Inbound (P04)
// POST /api/events/commerce
// Consumes the unified WebWakaEvent<T> schema (event, tenantId, payload, timestamp)
// ============================================================
app.post('/api/events/commerce', async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: 'Invalid JSON' }, 400); }

  // Unified WebWakaEvent<T> schema: read `event` field (not legacy `type`)
  const eventType = (body.event ?? body.type) as string | undefined;
  const payload = body.payload as Record<string, unknown> | undefined;

  if (!eventType) return c.json({ success: false, error: 'Event type is required' }, 400);
  log('INFO', 'CommerceEvents', `Inbound event: ${eventType}`);

  if (eventType === 'order.ready_for_delivery') {
    if (!payload) return c.json({ success: false, error: 'Payload is required' }, 400);
    const { orderId, tenantId, sourceModule, pickupAddress, deliveryAddress, itemsSummary, weightKg, preferredProviders, vendorId } = payload as Record<string, unknown>;

    if (!orderId || !tenantId || !sourceModule || !pickupAddress || !deliveryAddress || !itemsSummary) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    // Idempotency check
    const existing = await c.env.DB.prepare('SELECT id FROM delivery_requests WHERE orderId = ? LIMIT 1').bind(orderId).first();
    if (existing) {
      log('INFO', 'CommerceEvents', 'Duplicate orderId — skipping', { orderId });
      return c.json({ success: true, note: 'duplicate' });
    }

    const internalDeliveryId = genId('DR');
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`
      INSERT INTO delivery_requests (orderId, tenantId, sourceModule, vendorId, pickupAddress, deliveryAddress, itemsSummary, weightKg, status, internalDeliveryId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PICKING_PROVIDER', ?, ?, ?)
    `).bind(
      orderId, tenantId, sourceModule, vendorId ?? null,
      JSON.stringify(pickupAddress), JSON.stringify(deliveryAddress),
      itemsSummary, weightKg ?? null, internalDeliveryId, now, now,
    ).run();

    // Compute quotes
    const pickup = pickupAddress as DeliveryAddress;
    const delivery = deliveryAddress as DeliveryAddress;
    const wKg = typeof weightKg === 'number' ? weightKg : 0.5;
    const preferred = Array.isArray(preferredProviders) ? preferredProviders as string[] : undefined;
    const quotes = getProviderQuotes(pickup, delivery, wKg, preferred);

    await publishEvent(c.env, 'delivery.quote', {
      orderId, tenantId, quotes,
      ...(quotes.length === 0 ? { unavailable: 'No active providers available for this route' } : {}),
    });

    log('INFO', 'CommerceEvents', 'Delivery request created and quote published', { orderId, quoteCount: quotes.length });
    return c.json({ success: true });
  }

  // T-CVC-02: Consume delivery.status_changed events to update order_tracking table
  if (eventType === 'delivery.status_changed') {
    if (!payload) return c.json({ success: false, error: 'Payload is required' }, 400);
    const { orderId, tenantId, status, provider, trackingUrl, estimatedDelivery, notes } = payload as Record<string, string>;
    if (!orderId || !tenantId || !status) {
      return c.json({ success: false, error: 'orderId, tenantId, and status are required' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    try {
      // Fetch existing record to append to statusHistory
      const existing = await c.env.DB.prepare(
        'SELECT statusHistory FROM order_tracking WHERE orderId = ? AND tenantId = ? LIMIT 1'
      ).bind(orderId, tenantId).first() as Record<string, unknown> | null;

      const history: Array<{ status: string; timestamp: number; provider?: string; notes?: string }> =
        existing?.statusHistory ? JSON.parse(existing.statusHistory as string) : [];
      history.push({ status, timestamp: now, ...(provider ? { provider } : {}), ...(notes ? { notes } : {}) });

      await c.env.DB.prepare(`
        INSERT INTO order_tracking (orderId, tenantId, sourceModule, status, provider, trackingUrl, estimatedDelivery, notes, statusHistory, createdAt, updatedAt)
        VALUES (?, ?, 'commerce', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(orderId, tenantId) DO UPDATE SET
          status = excluded.status,
          provider = COALESCE(excluded.provider, provider),
          trackingUrl = COALESCE(excluded.trackingUrl, trackingUrl),
          estimatedDelivery = COALESCE(excluded.estimatedDelivery, estimatedDelivery),
          notes = COALESCE(excluded.notes, notes),
          statusHistory = excluded.statusHistory,
          updatedAt = excluded.updatedAt
      `).bind(
        orderId, tenantId, status,
        provider ?? null, trackingUrl ?? null, estimatedDelivery ?? null, notes ?? null,
        JSON.stringify(history), now, now,
      ).run();

      log('INFO', 'CommerceEvents', 'order_tracking updated via delivery.status_changed', { orderId, status });
      return c.json({ success: true });
    } catch (err) {
      log('ERROR', 'CommerceEvents', 'Failed to update order_tracking', { err: String(err) });
      return c.json({ success: false, error: 'Failed to update tracking record' }, 500);
    }
  }

  log('INFO', 'CommerceEvents', `Unhandled event type: ${eventType}`);
  return c.json({ success: true, note: 'event type not handled' });
});

// ============================================================
// Provider Webhooks (P04)
// ============================================================
async function handleProviderWebhook(
  c: { req: { raw: Request; json: () => Promise<Record<string, unknown>> }; env: Env; json: (data: unknown, status?: number) => Response },
  provider: string,
  statusMap: Record<string, string>,
  sigVerifier: (req: Request, secret?: string) => boolean,
  secretKey: keyof Env,
): Promise<Response> {
  if (!sigVerifier(c.req.raw, c.env[secretKey] as string | undefined)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  const { orderId, tenantId, status: providerStatus, trackingUrl, estimatedDelivery, notes } = body as Record<string, string>;
  if (!orderId || !tenantId || !providerStatus) return c.json({ error: 'orderId, tenantId, and status are required' }, 400);

  const canonicalStatus = statusMap[providerStatus];
  if (!canonicalStatus) return c.json({ ok: true, note: 'Unknown status — ignored' });

  const existing = await c.env.DB.prepare('SELECT * FROM delivery_requests WHERE orderId = ? LIMIT 1').bind(orderId).first() as Record<string, unknown> | null;
  if (!existing) return c.json({ error: 'Delivery request not found' }, 404);

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'UPDATE delivery_requests SET status = ?, assignedProvider = ?, updatedAt = ? WHERE orderId = ?'
  ).bind(canonicalStatus, provider, now, orderId).run();

  await publishEvent(c.env, 'delivery.status_changed', {
    orderId, tenantId,
    deliveryId: existing.internalDeliveryId ?? orderId,
    provider, status: canonicalStatus,
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(estimatedDelivery ? { estimatedDelivery } : {}),
    ...(notes ? { notes } : {}),
  });

  log('INFO', `${provider}Webhook`, 'Processed', { orderId, canonicalStatus });
  return c.json({ ok: true });
}

app.post('/api/webhooks/gig', (c) => handleProviderWebhook(c as never, 'gig', GIG_STATUS_MAP, verifyGigSig, 'GIG_WEBHOOK_SECRET'));
app.post('/api/webhooks/kwik', (c) => handleProviderWebhook(c as never, 'kwik', KWIK_STATUS_MAP, verifyKwikSig, 'KWIK_WEBHOOK_SECRET'));
app.post('/api/webhooks/sendbox', (c) => handleProviderWebhook(c as never, 'sendbox', SENDBOX_STATUS_MAP, verifySendboxSig, 'SENDBOX_WEBHOOK_SECRET'));

// ============================================================
// Transport Integration (P12)
// POST /internal/transport-events
// ============================================================
app.post('/internal/transport-events', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secret = c.env.INTER_SERVICE_SECRET;
  if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const eventType = c.req.header('X-Webwaka-Event-Type');
  if (!eventType) return c.json({ error: 'Missing X-Webwaka-Event-Type header' }, 400);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON' }, 400); }

  log('INFO', 'TransportIntegration', `Received event: ${eventType}`);
  const now = Math.floor(Date.now() / 1000);

  if (eventType === 'parcel.waybill_created') {
    const data = body as { trip_id?: string; waybill_id?: string; sender?: Record<string, string>; recipient?: Record<string, string>; description?: string; weight_kg?: number; declared_value_kobo?: number; fees_kobo?: number };
    if (!data.trip_id || !data.waybill_id) return c.json({ error: 'Missing trip_id or waybill_id' }, 400);

    const trackingNumber = generateTrackingNumber();
    const weightGrams = Math.round((data.weight_kg ?? 0) * 1000);
    await c.env.DB.prepare(`
      INSERT INTO parcels (tenantId, trackingNumber, status, priority, senderName, senderPhone, senderAddress,
        recipientName, recipientPhone, recipientAddress, recipientCity, recipientState,
        description, weightGrams, deliveryFeeKobo, insuranceValueKobo, currency,
        createdById, tripId, waybillId, seatAssignmentStatus, createdAt, updatedAt)
      VALUES (?, ?, 'PENDING', 'STANDARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 0, ?, ?, 'none', ?, ?)
    `).bind(
      data.trip_id, trackingNumber,
      data.sender?.name ?? '', data.sender?.phone ?? '', data.sender?.address ?? '',
      data.recipient?.name ?? '', data.recipient?.phone ?? '', data.recipient?.address ?? '',
      data.recipient?.city ?? '', data.recipient?.state ?? '',
      data.description ?? null, weightGrams,
      data.fees_kobo ?? 0, data.declared_value_kobo ?? 0,
      data.trip_id, data.waybill_id, now, now,
    ).run();
    log('INFO', 'TransportIntegration', 'Parcel created from waybill', { tripId: data.trip_id, trackingNumber });
    return c.json({ received: true });
  }

  if (eventType === 'trip.state_changed') {
    const data = body as { trip_id?: string; new_state?: string };
    if (!data.trip_id || !data.new_state) return c.json({ error: 'Missing trip_id or new_state' }, 400);

    if (data.new_state === 'in_transit') {
      await c.env.DB.prepare(
        "UPDATE parcels SET status = 'IN_TRANSIT', updatedAt = ? WHERE tripId = ? AND status = 'PENDING'"
      ).bind(now, data.trip_id).run();
    } else if (data.new_state === 'completed') {
      await c.env.DB.prepare(
        "UPDATE parcels SET status = 'DELIVERED', actualDeliveryAt = ?, updatedAt = ? WHERE tripId = ? AND status = 'IN_TRANSIT'"
      ).bind(now, now, data.trip_id).run();
    }
    return c.json({ received: true });
  }

  return c.json({ received: true, note: 'event type not handled' });
});

// ============================================================
// Export
// ============================================================
export { app };  // Named export for Vitest integration tests (T-CVC-02)
export default app;
