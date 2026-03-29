/**
 * WebWaka Logistics Suite - Unified Cloudflare Worker Entry Point
 * Replaces Express server with Hono for Workers/D1 compatibility.
 * Invariants: Multi-tenancy, Nigeria-First, Offline-First
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwtAuthMiddleware } from '@webwaka/core';

export interface Env {
  DB: D1Database;
  SESSIONS_KV: KVNamespace;
  EVENTS: KVNamespace;
  STORAGE: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'x-tenant-id'],
}));

// Health check (public)
app.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'webwaka-logistics',
      environment: c.env?.DB ? 'production' : 'development',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
    }
  });
});

// JWT auth middleware - protects all /api/* routes
app.use('/api/*', jwtAuthMiddleware({
  publicRoutes: [
    { method: 'GET', path: '/health' }
  ]
}));

// Note: tRPC routes will be migrated to Hono routes in a future PR
// For now, we provide a placeholder for the API
app.all('/api/*', (c) => {
  return c.json({
    success: false,
    error: 'API routes are currently being migrated to Hono'
  }, 501);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Route not found',
    availableRoutes: ['/health'],
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;
