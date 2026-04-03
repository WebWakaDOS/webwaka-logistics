/**
 * T-CVC-02: Order Tracking Tests — Logistics Worker
 *
 * Covers:
 *   1. POST /internal/tracking-token  — HMAC-signed token generation
 *   2. GET  /api/orders/track         — token validation + tracking lookup
 *   3. POST /api/events/commerce      — delivery.status_changed consumer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { app } from '../../src/worker';

// ─────────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const INTER_SERVICE_SECRET = 'test-inter-service-secret';
const TRACKING_SECRET = 'test-tracking-secret';
const TENANT_ID = 'tnt_test';
const ORDER_ID = 'order_test_001';

/** Minimal D1-like mock for in-memory test state */
function makeDb() {
  const orderTracking: Record<string, Record<string, unknown>> = {};
  const trackingTokens: Record<string, Record<string, unknown>> = {};
  const deliveryRequests: Record<string, Record<string, unknown>> = {};

  function makeStmt(sql: string) {
    let boundArgs: unknown[] = [];
    const stmt = {
      bind: (...args: unknown[]) => { boundArgs = args; return stmt; },
      run: async () => {
        if (sql.includes('INSERT') && sql.includes('tracking_tokens')) {
          const [token, orderId, tenantId, sourceModule, expiresAt, createdAt] = boundArgs;
          trackingTokens[token as string] = { token, orderId, tenantId, sourceModule, expiresAt, createdAt };
        }
        if (sql.includes('INSERT') && sql.includes('order_tracking')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          // boundArgs: orderId, tenantId, status, provider, trackingUrl, estimatedDelivery, notes, statusHistory, now, now
          orderTracking[key] = {
            orderId: boundArgs[0], tenantId: boundArgs[1], sourceModule: 'commerce',
            status: boundArgs[2], provider: boundArgs[3], trackingUrl: boundArgs[4],
            estimatedDelivery: boundArgs[5], notes: boundArgs[6],
            statusHistory: boundArgs[7], createdAt: boundArgs[8], updatedAt: boundArgs[9],
          };
        }
        return { success: true };
      },
      first: async () => {
        if (sql.includes('order_tracking') && sql.includes('WHERE orderId')) {
          const key = `${boundArgs[0]}:${boundArgs[1]}`;
          return orderTracking[key] ?? null;
        }
        if (sql.includes('delivery_requests') && sql.includes('WHERE orderId')) {
          return deliveryRequests[boundArgs[0] as string] ?? null;
        }
        return null;
      },
      all: async () => ({ results: [] }),
    };
    return stmt;
  }

  return {
    prepare: (sql: string) => makeStmt(sql),
    _orderTracking: orderTracking,
    _trackingTokens: trackingTokens,
    _deliveryRequests: deliveryRequests,
  };
}

function makeEnv(db: ReturnType<typeof makeDb>) {
  return {
    DB: db,
    INTER_SERVICE_SECRET,
    TRACKING_SECRET,
    LOGISTICS_PORTAL_URL: 'https://logistics.webwaka.ng',
    SESSIONS_KV: undefined,
    EVENTS: undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a signed tracking token via the worker endpoint
// ─────────────────────────────────────────────────────────────────────────────

async function generateToken(db: ReturnType<typeof makeDb>): Promise<{ token: string; trackingUrl: string; expiresAt: number }> {
  const env = makeEnv(db);
  const req = new Request('https://logistics.internal/internal/tracking-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
    },
    body: JSON.stringify({ orderId: ORDER_ID, tenantId: TENANT_ID, sourceModule: 'single-vendor' }),
  });
  const res = await app.fetch(req, env);
  expect(res.status).toBe(200);
  const json = await res.json<{ success: boolean; data: { token: string; trackingUrl: string; expiresAt: number } }>();
  expect(json.success).toBe(true);
  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: POST /internal/tracking-token
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /internal/tracking-token', () => {
  it('returns 401 without Authorization header', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/internal/tracking-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: ORDER_ID, tenantId: TENANT_ID }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong Authorization secret', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/internal/tracking-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-secret',
      },
      body: JSON.stringify({ orderId: ORDER_ID, tenantId: TENANT_ID }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(401);
  });

  it('returns 400 when orderId is missing', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/internal/tracking-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({ tenantId: TENANT_ID }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it('returns 400 when tenantId is missing', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/internal/tracking-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({ orderId: ORDER_ID }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it('generates a valid signed token with trackingUrl', async () => {
    const db = makeDb();
    const data = await generateToken(db);
    expect(data.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(data.trackingUrl).toContain('https://logistics.webwaka.ng');
    expect(data.trackingUrl).toContain('token=');
    expect(data.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('token payload encodes orderId and tenantId', async () => {
    const db = makeDb();
    const data = await generateToken(db);
    const [payloadB64] = data.token.split('.');
    const decoded = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const [oid, tid] = decoded.split(':');
    expect(oid).toBe(ORDER_ID);
    expect(tid).toBe(TENANT_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: GET /api/orders/track
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/orders/track', () => {
  it('returns 400 when neither token nor order_id+tenant_id provided', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/api/orders/track');
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed token', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/api/orders/track?token=notavalidtoken');
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it('returns 401 for tampered token', async () => {
    const db = makeDb();
    const data = await generateToken(db);
    const [payload] = data.token.split('.');
    const tamperedToken = `${payload}.invalidsignature`;
    const req = new Request(`https://logistics.internal/api/orders/track?token=${encodeURIComponent(tamperedToken)}`);
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(401);
  });

  it('returns 404 for valid token but no tracking record', async () => {
    const db = makeDb();
    const data = await generateToken(db);
    const req = new Request(`https://logistics.internal/api/orders/track?token=${encodeURIComponent(data.token)}`);
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(404);
  });

  it('returns tracking data for valid token after delivery.status_changed event', async () => {
    const db = makeDb();
    // First: generate a token
    const data = await generateToken(db);

    // Then: simulate a delivery.status_changed event to populate order_tracking
    const eventReq = new Request('https://logistics.internal/api/events/commerce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({
        event: 'delivery.status_changed',
        tenantId: TENANT_ID,
        payload: {
          orderId: ORDER_ID,
          tenantId: TENANT_ID,
          status: 'IN_TRANSIT',
          provider: 'gig',
          notes: 'Package picked up from sender',
        },
        timestamp: new Date().toISOString(),
      }),
    });
    const eventRes = await app.fetch(eventReq, makeEnv(db));
    expect(eventRes.status).toBe(200);

    // Now: track with the signed token
    const trackReq = new Request(`https://logistics.internal/api/orders/track?token=${encodeURIComponent(data.token)}`);
    const trackRes = await app.fetch(trackReq, makeEnv(db));
    expect(trackRes.status).toBe(200);
    const json = await trackRes.json<{ success: boolean; data: { status: string; provider: string } }>();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('IN_TRANSIT');
    expect(json.data.provider).toBe('gig');
  });

  it('returns tracking data for direct order_id+tenant_id lookup', async () => {
    const db = makeDb();
    // Populate order_tracking via event
    const eventReq = new Request('https://logistics.internal/api/events/commerce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({
        event: 'delivery.status_changed',
        tenantId: TENANT_ID,
        payload: {
          orderId: ORDER_ID,
          tenantId: TENANT_ID,
          status: 'DELIVERED',
          provider: 'sendbox',
        },
        timestamp: new Date().toISOString(),
      }),
    });
    await app.fetch(eventReq, makeEnv(db));

    const trackReq = new Request(
      `https://logistics.internal/api/orders/track?order_id=${ORDER_ID}&tenant_id=${TENANT_ID}`
    );
    const trackRes = await app.fetch(trackReq, makeEnv(db));
    expect(trackRes.status).toBe(200);
    const json = await trackRes.json<{ success: boolean; data: { status: string } }>();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('DELIVERED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: POST /api/events/commerce — delivery.status_changed consumer
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/events/commerce — delivery.status_changed', () => {
  it('returns 400 when payload is missing orderId', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/api/events/commerce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({
        event: 'delivery.status_changed',
        tenantId: TENANT_ID,
        payload: { tenantId: TENANT_ID, status: 'IN_TRANSIT' },
        timestamp: new Date().toISOString(),
      }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it('returns 400 when payload is missing status', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/api/events/commerce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({
        event: 'delivery.status_changed',
        tenantId: TENANT_ID,
        payload: { orderId: ORDER_ID, tenantId: TENANT_ID },
        timestamp: new Date().toISOString(),
      }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(400);
  });

  it('upserts order_tracking on valid delivery.status_changed event', async () => {
    const db = makeDb();
    const req = new Request('https://logistics.internal/api/events/commerce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
      },
      body: JSON.stringify({
        event: 'delivery.status_changed',
        tenantId: TENANT_ID,
        payload: {
          orderId: ORDER_ID,
          tenantId: TENANT_ID,
          status: 'PICKED_UP',
          provider: 'kwik',
          notes: 'Rider on the way',
        },
        timestamp: new Date().toISOString(),
      }),
    });
    const res = await app.fetch(req, makeEnv(db));
    expect(res.status).toBe(200);
    const json = await res.json<{ success: boolean }>();
    expect(json.success).toBe(true);

    // Verify the record was written to the mock DB
    const key = `${ORDER_ID}:${TENANT_ID}`;
    const record = db._orderTracking[key];
    expect(record).toBeDefined();
    expect(record.status).toBe('PICKED_UP');
    expect(record.provider).toBe('kwik');
  });

  it('appends to statusHistory on subsequent events', async () => {
    const db = makeDb();
    const makeEvent = (status: string) =>
      new Request('https://logistics.internal/api/events/commerce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${INTER_SERVICE_SECRET}`,
        },
        body: JSON.stringify({
          event: 'delivery.status_changed',
          tenantId: TENANT_ID,
          payload: { orderId: ORDER_ID, tenantId: TENANT_ID, status },
          timestamp: new Date().toISOString(),
        }),
      });

    await app.fetch(makeEvent('PENDING'), makeEnv(db));
    await app.fetch(makeEvent('PICKED_UP'), makeEnv(db));
    await app.fetch(makeEvent('IN_TRANSIT'), makeEnv(db));

    const key = `${ORDER_ID}:${TENANT_ID}`;
    const record = db._orderTracking[key];
    expect(record).toBeDefined();
    // The final status should be IN_TRANSIT
    expect(record.status).toBe('IN_TRANSIT');
    // statusHistory should have accumulated all 3 events
    const history = JSON.parse(record.statusHistory as string) as Array<{ status: string }>;
    expect(history.length).toBe(3);
    expect(history[0].status).toBe('PENDING');
    expect(history[1].status).toBe('PICKED_UP');
    expect(history[2].status).toBe('IN_TRANSIT');
  });
});
