# Logistics Module Migration Plan: Express/MySQL to Workers/D1

## Overview
The `webwaka-logistics` repository currently uses an Express/MySQL stack, which violates the platform's core invariant: **Build Once Use Infinitely** (all services must run on Cloudflare Workers/D1/KV). This document outlines the migration plan to transition the logistics module to the canonical stack.

## Phase 1: Authentication Layer Migration (Completed)
- [x] Adopt `@webwaka/core` JWT authentication middleware.
- [x] Replace Express session cookies with stateless JWTs stored in Cloudflare KV (`SESSIONS_KV`).
- [x] Ensure tenant isolation using `getTenantId` from `@webwaka/core`.

## Phase 2: Database Migration (MySQL to D1)
- [ ] Export current MySQL schema to SQLite-compatible D1 schema.
- [ ] Replace `drizzle-orm/mysql2` with `drizzle-orm/d1`.
- [ ] Update all database queries to use D1 bindings instead of MySQL connections.
- [ ] Write data migration scripts to move existing data from MySQL to D1.

## Phase 3: Runtime Migration (Express to Hono/Workers)
- [ ] Replace Express router with Hono.
- [ ] Convert all Express middleware to Hono middleware.
- [ ] Update `server/index.ts` to export a Cloudflare Worker fetch handler instead of starting an Express server.
- [ ] Update `wrangler.toml` with necessary bindings (D1, KV, R2).

## Phase 4: Event Bus Harmonization
- [ ] Update `server/eventBus.ts` to use `emitEvent` from `@webwaka/core`.
- [ ] Ensure all events follow the standardized schema: `{ event, tenantId, payload, timestamp }`.

## Phase 5: CI/CD Standardization
- [ ] Adopt the standard GitHub Actions workflows for testing and deployment to Cloudflare.
- [ ] Ensure D1 migrations are applied automatically during deployment.

## Rollout Strategy
1. Deploy the new Workers/D1 stack alongside the existing Express/MySQL stack.
2. Perform a one-time data sync from MySQL to D1.
3. Route a small percentage of traffic to the new stack (canary release).
4. Monitor error rates and performance.
5. Once stable, route 100% of traffic to the new stack and decommission the old stack.
