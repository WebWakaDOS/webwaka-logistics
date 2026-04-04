# WEBWAKA-LOGISTICS DEEP RESEARCH + ENHANCEMENT TASKBOOK + QA PROMPT FACTORY

**Repo:** `webwaka-logistics`
**Generated:** 2026-04-04
**Author:** Expert Research & Enhancement Analysis
**Status:** Phase 1 Execution-Ready

---

## TABLE OF CONTENTS

1. [Repo Deep Understanding](#1-repo-deep-understanding)
2. [External Best-Practice Research](#2-external-best-practice-research)
3. [Synthesis and Gap Analysis](#3-synthesis-and-gap-analysis)
4. [Top 20 Enhancements](#4-top-20-enhancements)
5. [Bug Fix Recommendations](#5-bug-fix-recommendations)
6. [Task Breakdown with Full Details](#6-task-breakdown-with-full-details)
7. [QA Plans](#7-qa-plans)
8. [Implementation Prompt for Each Task](#8-implementation-prompts)
9. [QA Prompt for Each Task](#9-qa-prompts)
10. [Priority Order](#10-priority-order)
11. [Dependencies Map](#11-dependencies-map)
12. [Phase 1 / Phase 2 Split](#12-phase-split)
13. [Repo Context and Ecosystem Notes](#13-ecosystem-notes)
14. [Governance and Reminder Block](#14-governance-and-reminders)
15. [Execution Readiness Notes](#15-execution-readiness)

---

## 1. REPO DEEP UNDERSTANDING

### 1.1 Overview

`webwaka-logistics` is a **multi-tenant, Nigeria-first, offline-capable logistics management platform** — one component in the broader WebWaka multi-repo ecosystem. It is the internal operations layer: parcel creation, tracking, warehouse receiving, dispatch clustering, rider onboarding/KYC, proof of delivery, and external provider integrations.

This is **not a standalone app**. It depends on:
- `@webwaka/core` npm package — shared event contracts, Termii SMS, Cloudflare SDK utilities
- A separate **OAuth server** (`OAUTH_SERVER_URL`) — auth is fully delegated to an external service
- A separate **Fintech repo** — handles KYC verification and emits `kyc.verification_completed` webhooks
- A separate **transport repo** — handles trips, waybills, seat blocking; events exchanged via `TRANSPORT_BASE_URL`
- A separate **Commerce/Commerce repo** — emits `order.ready_for_delivery` events consumed here

### 1.2 Repository Structure

```
webwaka-logistics/
├── client/                      # React 19 + Vite frontend
│   ├── public/
│   │   ├── manifest.json        # PWA manifest
│   │   └── sw.js                # Service worker (cache-first + network-first)
│   └── src/
│       ├── _core/hooks/         # useAuth.ts (OAuth + JWT session)
│       ├── components/          # DashboardLayout, CameraPOD, StatusBadge, etc.
│       ├── contexts/            # I18nContext, ThemeContext
│       ├── hooks/               # useOnlineStatus, useTenantId, useMobile, usePersistFn
│       ├── lib/                 # trpc, offlineDb (Dexie), syncEngine, photoPod, i18n
│       └── pages/               # Home, ParcelsList, ParcelDetail, CreateParcel,
│                                #   PublicTracking, Dispatch, ReceivingScanner,
│                                #   RiderOnboarding, RiderApplications
├── server/
│   ├── _core/                   # env, sdk (OAuth), trpc (procedures), vite, map, llm,
│   │                            #   notification, cookies, context, imageGeneration
│   ├── events/                  # commerceEventBus/Router, kycEventBus/Router,
│   │                            #   kycVerificationCompleted, orderReadyForDelivery
│   ├── routers/                 # parcels, riders, dispatch, warehouse, logistics
│   ├── webhooks/providers/      # gig, kwik, sendbox
│   ├── clustering.ts            # T-LOG-03: geospatial grid clustering (pure TS)
│   ├── db.ts                    # better-sqlite3 lazy factory (dev) — D1 for prod
│   ├── delivery.db.ts           # delivery_requests CRUD
│   ├── dispatch.db.ts           # dispatch assignment CRUD
│   ├── eventBus.ts              # parcel event publisher (log-only stub — no real bus)
│   ├── logger.ts                # pino-compatible structured logger
│   ├── otp.ts                   # OTP generation, SHA-256 hashing, offline HMAC tokens
│   ├── parcels.db.ts            # parcels/parcel_updates/POD CRUD
│   ├── parcels.utils.ts         # naira↔kobo, WAT format, status transitions
│   ├── riders.db.ts             # rider/guarantor CRUD
│   ├── storage.ts               # R2 / S3 storagePut wrapper
│   ├── transport-events.ts      # P12: publish parcel.seats_required
│   └── transport-integration.ts # P12: inbound transport events (/internal)
├── shared/
│   ├── _core/errors.ts          # HttpError, BadRequestError, etc.
│   ├── const.ts                 # COOKIE_NAME, AXIOS_TIMEOUT_MS
│   └── types.ts                 # re-exports from drizzle schema
├── drizzle/
│   ├── schema.ts                # Drizzle ORM schema: users, parcels, parcelUpdates,
│   │                            #   proofOfDelivery, deliveryRequests, riders, guarantors
│   ├── relations.ts             # Drizzle relations
│   └── migrations/              # Auto-generated Drizzle migrations
├── migrations/                  # Manual SQL migrations (D1)
│   ├── 001_logistics_schema.sql
│   ├── 002_delivery_zones.sql
│   ├── 003_order_tracking.sql
│   └── 004_rider_kyc.sql
├── packages/core/               # Local @webwaka/core source (symlinked)
├── .github/workflows/           # CI: test.yml, deploy-prod.yml, deploy-staging.yml,
│                                #   preview-pr.yml (currently uses pnpm — mismatch bug)
├── wrangler.toml                # Cloudflare: D1, KV Sessions, KV Events, R2
├── drizzle.config.ts            # Uses d1-http driver (Cloudflare-only)
└── vitest.config.ts             # Test runner config
```

### 1.3 Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| UI library | Radix UI / shadcn |
| Styling | Tailwind CSS 4 |
| Client state / data fetching | TanStack Query v5 + tRPC v11 |
| Client routing | wouter |
| Offline storage | Dexie v4 (IndexedDB) |
| Backend framework | Express.js 4 |
| API layer | tRPC v11 |
| ORM | Drizzle ORM |
| DB (dev) | better-sqlite3 (SQLite file) |
| DB (prod) | Cloudflare D1 |
| Object storage | Cloudflare R2 / AWS S3 compatible |
| Auth | JWT (jose) + external OAuth server |
| SMS | Termii via `@webwaka/core` |
| Deployment | Cloudflare Workers (wrangler) |
| Test runner | Vitest |
| CI/CD | GitHub Actions |

### 1.4 Implemented Features

| Feature | Code Location | Status |
|---------|--------------|--------|
| Parcel CRUD (create, list, get, update, delete) | `server/routers/parcels.ts` + `server/parcels.db.ts` | ✅ Complete |
| Parcel status state machine | `server/parcels.utils.ts` | ✅ Complete (gap: missing IN_WAREHOUSE) |
| Public tracking (no auth) | `client/src/pages/PublicTracking.tsx` | ✅ Complete |
| Offline-first mutation queue | `client/src/lib/syncEngine.ts` + `offlineDb.ts` | ✅ Complete |
| Photo POD with watermarking (T-LOG-02) | `client/src/lib/photoPod.ts` + `CameraPOD.tsx` | ✅ Complete |
| OTP delivery verification (L-06) | `server/otp.ts` + `server/routers/parcels.ts` | ✅ Complete |
| Warehouse receiving scanner (T-LOG-04) | `client/src/pages/ReceivingScanner.tsx` + `server/routers/warehouse.ts` | ✅ Complete |
| Geospatial clustering (T-LOG-03) | `server/clustering.ts` + `client/src/pages/Dispatch.tsx` | ✅ Complete |
| Rider KYC onboarding (T-LOG-05) | `server/routers/riders.ts` + `client/src/pages/RiderOnboarding.tsx` | ✅ Complete |
| Provider webhooks (P04) | `server/webhooks/providers/gig,kwik,sendbox.ts` | ✅ Complete |
| Commerce event integration | `server/events/commerceEventRouter.ts` | ✅ Complete |
| KYC event integration | `server/events/kycEventRouter.ts` | ✅ Complete |
| Transport integration (P12) | `server/transport-integration.ts` | ✅ Complete |
| i18n: en, yo, ig, ha | `client/src/lib/i18n.ts` | ✅ Complete |
| PWA manifest + service worker | `client/public/manifest.json` + `sw.js` | ✅ Basic |
| Digital signature capture | Placeholder only | ❌ Missing |
| Payment integration (Paystack) | Data model ready, no integration | ❌ Missing |
| Real event bus | Log-only stub | ❌ Missing |
| Agent assignment UI | Hardcoded agentId: 1 | ❌ Broken |
| Pagination UI | Hardcoded limit 50 | ❌ Missing |
| Dashboard stats | Loads all parcels (inefficient) | ⚠️ Broken |
| Push notifications | notifyOwner available; per-user push not wired | ⚠️ Partial |

### 1.5 Database Schema Summary

**Tables:** `users`, `parcels`, `parcel_updates`, `proof_of_delivery`, `delivery_requests`, `riders`, `guarantors`

**Key invariants:**
- All monetary values stored as integers in kobo (NGN × 100)
- All timestamps stored as `INTEGER` (Unix epoch)
- Multi-tenant: every table has `tenantId TEXT NOT NULL`
- Soft deletes: `deletedAt INTEGER` on parcels, POD, riders
- NDPR: no raw license numbers, BVN, or sensitive ID numbers stored — only R2 document keys

### 1.6 Event Architecture

The system is **event-driven** with three event domains:
1. **Parcel events** (`server/eventBus.ts`) — emitted on create, dispatch, status changes, delivery — currently **log-only** (stub), no real message broker
2. **Commerce events** (`server/events/commerceEventBus.ts`) — forwarded to external URL (`COMMERCE_EVENT_URL`); received via `/api/events/commerce`
3. **KYC events** (`server/events/kycEventBus.ts`) — forwarded to Fintech repo; received via `/api/events/kyc`

### 1.7 Known Bugs (Pre-Analysis)

These were identified directly from code review before external research:

| # | Bug | Location | Severity |
|---|-----|----------|---------|
| B1 | CI/CD workflows use `pnpm` but project switched to `npm` | `.github/workflows/*.yml` | High |
| B2 | `useAuth` stores user in `localStorage` with `manus-runtime-user-info` key — Manus artifact leak | `client/src/_core/hooks/useAuth.ts` | High |
| B3 | `VALID_TRANSITIONS` missing `IN_WAREHOUSE` as a source state (can't move IN_WAREHOUSE → IN_TRANSIT) | `server/parcels.utils.ts` | High |
| B4 | GIG webhook signature verified via simple header equality, not HMAC — trivially spoofable | `server/webhooks/providers/gig.ts` | High |
| B5 | `generateTrackingNumber` uses `Math.random()` — not cryptographically secure | `server/parcels.db.ts` | Medium |
| B6 | OTP range: `Math.floor(Math.random() * 9000) + 1000` produces only 1000-9999, not 0000-9999 | `server/otp.ts` | Medium |
| B7 | Home page loads 100 parcels just to compute stats — severely inefficient | `client/src/pages/Home.tsx` | High |
| B8 | Dispatch page agent assignment hardcodes `agentId: 1` placeholder | `client/src/pages/Dispatch.tsx` | High |
| B9 | No rate limiting on public tracking endpoint — DoS vector | `server/routers/parcels.ts` | High |
| B10 | Service worker cache name hardcoded `webwaka-logistics-v1` — never invalidates on new deploys | `client/public/sw.js` | Medium |
| B11 | Two migration directories (`migrations/` and `drizzle/migrations/`) — undocumented conflict | Root | Medium |
| B12 | `drizzle.config.ts` uses `d1-http` driver which fails in local dev | `drizzle.config.ts` | Medium |
| B13 | `Kwik` and `Sendbox` webhooks have no signature verification at all | `server/webhooks/providers/kwik.ts`, `sendbox.ts` | High |
| B14 | No CSRF protection on any state-mutating API route | `server/_core/index.ts` | High |
| B15 | Parcel search uses `LIKE '%query%'` — no index on `trackingNumber` search | `server/parcels.db.ts` | Medium |

---

## 2. EXTERNAL BEST-PRACTICE RESEARCH

### 2.1 Logistics Platform Standards (Industry Research)

Based on deep research into world-class logistics platforms (DHL, FedEx, GIG Logistics, Sendbox Nigeria, Uber Freight, Lalamove, Bosta Egypt, Aramex Africa):

**Tracking & Status:**
- Industry standard: granular 10-20 status codes (not 8)
- Expected: ETA recalculation at every status change
- Expected: Real-time WebSocket or SSE-based tracking updates
- Expected: SMS + email + WhatsApp notifications at every status transition
- Nigeria-specific: Termii WhatsApp channel support (not just SMS)

**OTP Delivery Verification:**
- Best practice: 6-digit OTPs (not 4-digit) — reduces brute force attack surface
- Best practice: OTP rate limiting (max 3 attempts before lockout)
- Best practice: OTP resend with cooldown (60s)
- Best practice: Signed deep links for OTP entry (eliminates OTP interception)

**Proof of Delivery:**
- Best practice: Combined photo + electronic signature (not photo-only)
- Best practice: Recipient photo as an additional capture option
- Best practice: Chain of custody — photos at each status transition (collected, warehouse, delivery)
- Industry: Temper-evident digital PDF certificate generated from POD data

**Dispatch & Routing:**
- Best practice: Vehicle capacity constraints in clustering (not just geographic)
- Best practice: Estimated time calculation per route (Google Maps Distance Matrix)
- Best practice: Rider location tracking (real-time GPS from rider PWA)
- Best practice: Traffic-aware ETA (Google Maps real-time traffic)
- Nigeria-specific: Lagos traffic patterns make static ETAs unreliable

**Rider Management:**
- Best practice: Rider performance scorecards (on-time %, failed deliveries, customer ratings)
- Best practice: Earnings dashboard (per-delivery earnings, weekly summary)
- Best practice: License expiry push notifications (proactive suspension warning)
- Nigeria-specific: BVN/NIN verification via third-party APIs (not manual review)

**Offline-First PWA:**
- Best practice: Background Sync API (`SyncManager`) with exponential backoff
- Best practice: Workbox for service worker management (cache versioning, update flow)
- Best practice: IndexedDB compression for large photo blobs
- Best practice: Conflict resolution strategy for concurrent mutations
- Best practice: Sync status visible in UI at all times

**Security:**
- OWASP Top 10 for logistics APIs: input validation, rate limiting, HMAC webhook verification, JWT rotation, audit logging
- PCI DSS: any payment-touching flows must use tokenized values only
- NDPR (Nigeria): explicit consent collection, data subject rights (access, deletion), breach notification
- Best practice: Webhook HMAC-SHA256 signatures on all inbound webhooks (not header equality)

**Analytics & Reporting:**
- Best practice: Real-time dashboard counters (via Server-Sent Events or polling)
- Best practice: Parcel success rate, average delivery time, failed delivery rate per zone
- Best practice: Revenue per tenant, per zone, per rider
- Best practice: Heatmap of delivery zones for operational planning

**Multi-Tenancy:**
- Best practice: Dedicated tenant registry with per-tenant config (pricing tiers, feature flags)
- Best practice: Tenant-level API rate limiting
- Best practice: Tenant-level audit logs
- Best practice: Tenant onboarding flow (not just user openId as tenantId)

**CI/CD and DevOps:**
- Best practice: Automated migration tests on every PR
- Best practice: Environment parity (dev/staging/prod identical configs)
- Best practice: Canary deployments for Cloudflare Workers
- Best practice: Security scanning (SAST, dependency audit) in CI
- Best practice: Preview environments per PR (already partially implemented)

### 2.2 Nigerian Logistics Specific Research

- **Interswitch, Paystack, Flutterwave** are the dominant payment rails — Paystack is recommended for logistics fee collection due to Nigeria developer support
- **Termii** is correctly chosen for OTP SMS; also supports WhatsApp Business channel
- **GIG Express** is Nigeria's largest courier — webhook integration is critical
- **Last-mile challenge**: Lagos traffic, security, address ambiguity (no structured addressing) — AI-powered address normalization is increasingly used
- **Cash on Delivery (COD)**: dominant payment method in Nigeria — COD collection and reconciliation is a must-have feature not yet implemented
- **Multi-city expansion**: Abuja, PH, Kano, Ibadan after Lagos — inter-city routing needs different clustering grid (0.1° instead of 0.05°)
- **Fuel volatility**: Cost-per-km calculation must account for fuel price volatility — delivery fee calculator is important
- **Data costs**: Aggressive data compression for PWA is critical — riders on low-cost data plans

---

## 3. SYNTHESIS AND GAP ANALYSIS

### 3.1 What Exists vs. What Best-in-Class Systems Require

| Capability | Current State | Best-in-Class | Gap |
|-----------|--------------|---------------|-----|
| Parcel status tracking | 8 statuses, event log | 15+ granular statuses, real-time updates | Medium |
| OTP verification | 4-digit, no rate limiting | 6-digit, 3-attempt lockout, resend flow | High |
| Proof of delivery | Photo only (signature placeholder) | Photo + digital signature | High |
| Dispatch clustering | Geographic grid (pure TS) | Geographic + vehicle capacity aware | Medium |
| Rider management | KYC onboarding only | KYC + scorecards + earnings + live location | High |
| Event bus | Log-only stub | Real Cloudflare Queues / KV Events | Critical |
| Webhook security | GIG header-only, Kwik/Sendbox none | HMAC-SHA256 all webhooks | Critical |
| Rate limiting | None | Per-IP + per-tenant rate limiting | Critical |
| Analytics dashboard | Stats from all-parcels query | Dedicated aggregation endpoints + charts | High |
| Pagination | Hardcoded limit 50 | Cursor-based pagination with UI | High |
| Payment integration | Data model only | Paystack payment link + COD tracking | High |
| Push notifications | Not wired | Web Push for status updates | Medium |
| Service worker | Manual, basic | Workbox with versioned caching | Medium |
| CI/CD | pnpm mismatch | npm-aligned, with security scanning | High |
| Digital signature | Placeholder | Canvas signature with hash verification | High |
| Real-time tracking | Poll only | SSE or WebSocket | Medium |
| Multi-language | 4 languages (en/yo/ig/ha) | 4 languages (many strings incomplete) | Medium |
| Tenant management | openId as tenantId | Dedicated tenant registry (CORE-3) | High |
| CSRF protection | None | Double-submit cookie or SameSite=Strict | Critical |
| Audit logging | None | Structured audit trail for compliance | High |

---

## 4. TOP 20 ENHANCEMENTS

### ENH-01 — Fix CI/CD to use npm (Breaks All Automation)
All GitHub Actions workflows use `pnpm` but the project now uses `npm`. This breaks CI on every PR.

### ENH-02 — Implement HMAC Webhook Signature Verification for All Providers
GIG uses header equality. Kwik and Sendbox have zero verification. Replace all with HMAC-SHA256.

### ENH-03 — Add Rate Limiting to Public Endpoints
Public tracking and all unauthenticated endpoints have no rate limiting. Add per-IP throttling.

### ENH-04 — Fix Status Transition Map to Include IN_WAREHOUSE
`IN_WAREHOUSE → IN_TRANSIT` transition is missing from `VALID_TRANSITIONS`, blocking normal warehouse-to-dispatch flow.

### ENH-05 — Digital Signature Capture for POD
The POD flow has a placeholder for signature capture. Implement canvas-based electronic signature with hash verification.

### ENH-06 — OTP Security Hardening
Upgrade to 6-digit OTPs, add 3-attempt lockout, add resend with 60-second cooldown, add rate limiting.

### ENH-07 — Dedicated Stats/Analytics Endpoints
The home page loads 100 parcels just to compute 4 numbers. Create dedicated aggregation endpoints.

### ENH-08 — Pagination UI for Parcel List
Parcel list is hardcoded to 50 with no load-more or cursor-based pagination. Add proper pagination.

### ENH-09 — Fix Agent Assignment in Dispatch
Dispatch currently hardcodes `agentId: 1`. Wire up real agent selection from the authenticated agents list.

### ENH-10 — Wire Real Parcel Event Bus
`server/eventBus.ts` is a log-only stub. Wire to Cloudflare KV Events namespace already configured in `wrangler.toml`.

### ENH-11 — Remove Manus Runtime Artifact from useAuth
`useAuth.ts` contains `localStorage.setItem("manus-runtime-user-info", ...)` — a Manus-specific artifact that should not be in production code.

### ENH-12 — Add CSRF Protection
No CSRF protection on any mutating endpoint. Add `SameSite=Strict` cookie attribute and origin validation.

### ENH-13 — Replace Math.random() in Tracking Number and OTP Generation with Crypto
`generateTrackingNumber` and `generateOtp` use `Math.random()`. Replace with `crypto.getRandomValues()`.

### ENH-14 — Workbox Service Worker with Cache Versioning
The hand-written service worker has a hardcoded cache name and no update flow. Migrate to Workbox or add automated cache versioning.

### ENH-15 — Add Audit Logging for All Write Operations
No audit trail currently exists. Add structured audit log table and automatically record every write mutation.

### ENH-16 — Cash on Delivery (COD) Tracking
COD is the dominant payment method in Nigeria. Add COD amount field, collection status, and reconciliation flow.

### ENH-17 — License Expiry Monitoring (F-02)
The schema has `licenseExpiresAt` on riders but nothing checks or alerts on approaching expiry. Add automated suspension and alert system.

### ENH-18 — Multi-Channel Delivery Notifications (SMS + WhatsApp)
Currently OTP is the only notification. Add status-change SMS notifications to recipients at key transitions.

### ENH-19 — Inter-City vs. Intra-City Clustering Grid Selection
The clustering grid is hardcoded at 0.05° (intra-city). Add configurable grid precision per tenant for inter-city dispatch.

### ENH-20 — Comprehensive NDPR Compliance Module
NDPR requires explicit consent collection, data subject access/deletion requests, and breach notification. Add a compliance module.

---

## 5. BUG FIX RECOMMENDATIONS

### BUG-01 — CI Broken: pnpm vs npm Mismatch
**File:** `.github/workflows/test.yml`, `deploy-prod.yml`, `deploy-staging.yml`, `preview-pr.yml`
**Fix:** Replace all pnpm commands with npm equivalents.

### BUG-02 — Manus Runtime Leak in useAuth
**File:** `client/src/_core/hooks/useAuth.ts`
**Fix:** Remove the `localStorage.setItem("manus-runtime-user-info", ...)` call entirely.

### BUG-03 — Missing IN_WAREHOUSE in Status Transition Map
**File:** `server/parcels.utils.ts`
**Fix:** Add `IN_WAREHOUSE: ["IN_TRANSIT", "FAILED"]` to `VALID_TRANSITIONS`.

### BUG-04 — GIG Webhook Signature is Trivially Spoofable
**File:** `server/webhooks/providers/gig.ts`
**Fix:** Implement HMAC-SHA256 signature verification.

### BUG-05 — Home Page Stats Query Loads All Parcels
**File:** `client/src/pages/Home.tsx`
**Fix:** Call a dedicated stats endpoint instead of loading 100 parcels.

### BUG-06 — Dispatch Agent Hardcoded to ID 1
**File:** `client/src/pages/Dispatch.tsx`
**Fix:** Load agents from the DB and let user select from real list.

### BUG-07 — No Signature Verification on Kwik and Sendbox Webhooks
**File:** `server/webhooks/providers/kwik.ts`, `server/webhooks/providers/sendbox.ts`
**Fix:** Implement provider-specific HMAC signature verification.

### BUG-08 — Non-Cryptographic Random in Tracking Number
**File:** `server/parcels.db.ts`
**Fix:** Use `crypto.getRandomValues()` for the random component.

### BUG-09 — OTP Range Excludes Codes Below 1000
**File:** `server/otp.ts`
**Fix:** Use `crypto.getRandomValues()` padded to 4 digits (0000-9999).

### BUG-10 — Service Worker Never Invalidates Stale Cache
**File:** `client/public/sw.js`
**Fix:** Inject build hash into cache name at build time, or use Workbox.

---

## 6. TASK BREAKDOWN WITH FULL DETAILS

---

### TASK-01: Fix CI/CD Workflows (npm vs pnpm)

**Title:** Fix GitHub Actions Workflows to Use npm Instead of pnpm

**Objective:** All four CI/CD workflows currently use `pnpm` commands which fail because the project uses `npm`. Fix all workflow files to use npm.

**Why it matters:** Every PR check, every deployment pipeline, and every test run is currently broken. No automation works. This is the single highest-priority fix.

**Repo scope:** `.github/workflows/` only

**Dependencies:** None

**Prerequisites:** None

**Impacted modules:** CI/CD pipeline, all automated testing and deployment

**Likely files to change:**
- `.github/workflows/test.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/preview-pr.yml`

**Expected output:** All workflows run successfully with npm commands

**Acceptance criteria:**
- `pnpm` not mentioned in any workflow file
- `npm ci` used for clean installs
- `npm run test` used for test execution
- `npm run build` used for builds
- Node.js cache configured for npm (not pnpm)
- All workflow YAML files valid syntax

**Tests required:**
- Push a test branch and confirm workflow runs without pnpm-related errors
- Verify `npm run test` produces passing test results in CI

**Risks:** Low — purely config change, no code change

**Governance docs to consult:** `replit.md` (confirms npm is now used), `package.json` scripts

**Important reminders:**
- Do NOT introduce any new scripts in `package.json`
- CI cache key must use `package-lock.json` not `pnpm-lock.yaml`
- Remove the `pnpm/action-setup` step entirely

---

### TASK-02: Remove Manus Runtime Artifact from useAuth

**Title:** Remove Manus-Specific localStorage Call from useAuth Hook

**Objective:** The `useAuth` hook contains `localStorage.setItem("manus-runtime-user-info", JSON.stringify(meQuery.data))` — a Manus development environment artifact that should never reach production. Remove it.

**Why it matters:** This writes sensitive user session data (including name, email, openId) to localStorage unencrypted, under a key designed for a different platform's runtime. It is a data leak and a security violation.

**Repo scope:** `client/src/_core/hooks/useAuth.ts`

**Dependencies:** None

**Prerequisites:** None

**Impacted modules:** Authentication, all components that use `useAuth`

**Likely files to change:**
- `client/src/_core/hooks/useAuth.ts` — remove the localStorage.setItem call from the `state` useMemo

**Expected output:** The hook functions identically but no longer writes to localStorage

**Acceptance criteria:**
- No reference to `manus-runtime-user-info` anywhere in the codebase
- No reference to `localStorage.setItem` in auth-related hooks
- All existing authentication flows still work (login, logout, protected routes)
- The `state` useMemo still returns the correct shape

**Tests required:**
- Verify localStorage no longer contains `manus-runtime-user-info` key after login
- Verify `useAuth` still returns correct `user`, `isAuthenticated`, `loading` values
- Verify logout still clears session correctly

**Risks:** Very low — removing a single line

**Governance docs to consult:** NDPR compliance (sensitive data storage rules)

---

### TASK-03: Fix Missing IN_WAREHOUSE Status Transition

**Title:** Add IN_WAREHOUSE to the Status Transition Map

**Objective:** The parcel status `IN_WAREHOUSE` was added to the schema and enum (T-LOG-04) but was never added to `VALID_TRANSITIONS` in `server/parcels.utils.ts`. This means a parcel in `IN_WAREHOUSE` state cannot be transitioned to `IN_TRANSIT`, which blocks normal operations.

**Why it matters:** Parcels received at the warehouse (via the receiving scanner) get stuck in `IN_WAREHOUSE` with no way to progress to dispatch. This is a critical operational bug.

**Repo scope:** `server/parcels.utils.ts`

**Dependencies:** None (T-LOG-04 already implemented)

**Prerequisites:** None

**Impacted modules:** Parcels router (status update), dispatch flow, warehouse flow

**Likely files to change:**
- `server/parcels.utils.ts` — add `IN_WAREHOUSE: ["IN_TRANSIT", "FAILED"]` to `VALID_TRANSITIONS`
- `server/parcels.test.ts` — add test coverage for IN_WAREHOUSE transitions

**Expected output:** `IN_WAREHOUSE → IN_TRANSIT` and `IN_WAREHOUSE → FAILED` are valid transitions

**Acceptance criteria:**
- `isValidTransition("IN_WAREHOUSE", "IN_TRANSIT")` returns `true`
- `isValidTransition("IN_WAREHOUSE", "FAILED")` returns `true`
- `isValidTransition("IN_WAREHOUSE", "DELIVERED")` returns `false`
- Existing transition tests still pass
- `COLLECTED → IN_WAREHOUSE` also works (parcels arrive at warehouse from collection)

**Tests required:**
- Unit tests for all IN_WAREHOUSE transitions (valid and invalid)
- Integration test: create parcel → collect → warehouse → dispatch

**Risks:** Low — adding to a map

**Important reminders:**
- Also verify `COLLECTED → IN_WAREHOUSE` is valid (warehouse receiving flow)
- Do NOT change existing transitions — only add the new state

---

### TASK-04: Implement HMAC Webhook Signature Verification

**Title:** Replace All Webhook Signature Checks with HMAC-SHA256

**Objective:** 
- GIG webhook uses `signature === secret` (trivially spoofable)
- Kwik and Sendbox webhooks have zero verification
- All three must use HMAC-SHA256 against the raw request body

**Why it matters:** Any external actor who discovers the webhook URL can inject fake delivery status updates. This corrupts parcel status data and triggers fraudulent POD flows.

**Repo scope:** `server/webhooks/providers/`

**Dependencies:** None — uses Node.js built-in `crypto` module

**Prerequisites:** Environment secrets `GIG_WEBHOOK_SECRET`, `KWIK_WEBHOOK_SECRET`, `SENDBOX_WEBHOOK_SECRET` must be set

**Impacted modules:** All three webhook handlers, `webhookRouter.ts`

**Likely files to change:**
- `server/webhooks/providers/gig.ts`
- `server/webhooks/providers/kwik.ts`
- `server/webhooks/providers/sendbox.ts`
- `server/_core/index.ts` — must capture raw request body before JSON parsing for HMAC

**Expected output:** All three webhooks verify HMAC-SHA256 signatures before processing

**Acceptance criteria:**
- Requests with valid HMAC signature are processed
- Requests with invalid or missing signature return 401
- Uses `crypto.timingSafeEqual` to prevent timing attacks
- Raw body captured with `express.raw()` middleware before JSON parsing
- When `*_WEBHOOK_SECRET` env var is not set, logs a warning and skips in dev only

**Tests required:**
- Unit test: valid signature passes
- Unit test: invalid signature returns 401
- Unit test: missing signature returns 401
- Unit test: timing-safe comparison is used (ensure no string equality)
- Unit test: body parsing still works after raw body middleware

**Risks:** Medium — raw body capture must happen before express.json() — requires middleware ordering fix

**Important reminders:**
- `express.json()` consumes the request stream. Use `express.raw()` for webhook routes BEFORE `express.json()` for others.
- Each provider may use different header names for the signature — check their docs
- Use the `createLogger` pattern, not `console.log`

---

### TASK-05: Add Rate Limiting to Public and API Endpoints

**Title:** Implement Per-IP Rate Limiting on All Public and API Endpoints

**Objective:** The public tracking endpoint and all API endpoints have no rate limiting, making them vulnerable to DoS attacks and scraping.

**Why it matters:** In Nigeria, competitor scraping of tracking data is a real threat. DoS via the public tracking endpoint can take down the entire platform for all tenants.

**Repo scope:** `server/_core/index.ts`, new `server/_core/rateLimit.ts`

**Dependencies:** Install `express-rate-limit` package

**Prerequisites:** None

**Impacted modules:** All Express routes

**Likely files to change:**
- `server/_core/index.ts` — add rate limit middleware
- New `server/_core/rateLimit.ts` — rate limit configurations
- `package.json` — add `express-rate-limit` dependency

**Expected output:** 
- Public tracking: max 30 requests/minute per IP
- Auth endpoints: max 10 requests/minute per IP  
- General API: max 200 requests/minute per IP
- tRPC endpoint: max 100 requests/minute per IP

**Acceptance criteria:**
- Requests exceeding the limit return HTTP 429 with `Retry-After` header
- Different limits for different route groups
- Limits reset on time window expiry
- Rate limit headers (`X-RateLimit-*`) present on all responses
- Limit is per-IP (use `X-Forwarded-For` behind Cloudflare)

**Tests required:**
- Test that 31st request in a minute to `/track` returns 429
- Test that rate limit headers are correct
- Test that different route groups have different limits
- Test that Cloudflare IP forwarding is respected

**Risks:** Low — additive middleware change

**Important reminders:**
- Cloudflare sits in front — use `req.headers['cf-connecting-ip']` or `X-Forwarded-For` as the real IP key
- Do NOT apply rate limiting to Cloudflare health check paths

---

### TASK-06: Implement Digital Signature Capture for POD

**Title:** Add Canvas-Based Digital Signature Capture to Proof of Delivery

**Objective:** The POD flow has a signature placeholder (`signatureBase64: z.string().optional()` in the schema). Implement a proper canvas-based electronic signature pad that captures, encodes, and stores recipient signatures.

**Why it matters:** An electronic signature is legally required evidence in many Nigerian logistics disputes. Without it, POD is incomplete and legally challengeable.

**Repo scope:** Frontend + backend

**Dependencies:** No new npm packages needed — uses HTML5 Canvas API (same pattern as CameraPOD)

**Prerequisites:** TASK-03 must be complete (IN_WAREHOUSE transition fix)

**Impacted modules:** `CameraPOD.tsx`, `ParcelDetail.tsx`, `parcels.ts` router, `parcels.db.ts`, storage

**Likely files to change:**
- New `client/src/components/SignaturePad.tsx` — canvas signature component
- `client/src/pages/ParcelDetail.tsx` — integrate SignaturePad into POD flow
- `server/routers/parcels.ts` — already accepts `signatureBase64` in `podInput`
- No backend changes required (schema already supports it)

**Expected output:** Riders can draw a signature on a canvas touch screen, which is captured as a base64-encoded PNG and stored alongside the POD photo in R2

**Acceptance criteria:**
- SignaturePad renders a touch-friendly canvas
- Clear/reset button clears the canvas
- Confirm captures canvas as PNG blob → base64
- Cannot submit POD without both photo and signature
- Signature stored in R2 at `pod/{tenantId}/{parcelId}/signature-{timestamp}.png`
- `signatureUrl` populated in `proof_of_delivery` table
- Signature displayed on ParcelDetail POD card

**Tests required:**
- Unit test: canvas draws and captures correctly
- Integration test: POD submission with signature base64 stores in R2 and DB
- Mobile test: touch input works on a real Android device
- Test: empty/blank signature (pen not lifted) is rejected

**Risks:** Medium — canvas touch event handling is device-specific

**Important reminders:**
- Mobile-first: use `touchstart`, `touchmove`, `touchend` events, not just mouse events
- Signature should be white background with black ink
- Store the signature in R2 using the same `storagePut` pattern as photo POD

---

### TASK-07: Create Dedicated Stats/Analytics Endpoints

**Title:** Replace Full Parcel Load with Dedicated Aggregation Endpoints for Dashboard

**Objective:** The home page currently loads 100 parcels to compute 4 statistics. Create a dedicated `parcels.stats` tRPC endpoint that runs SQL COUNT queries and returns only the aggregated numbers.

**Why it matters:** Loading 100 parcels on every dashboard open is expensive bandwidth, heavy on the SQLite/D1 DB, and wastes the rider's data plan. Stats should be O(1) not O(n).

**Repo scope:** `server/routers/parcels.ts`, `server/parcels.db.ts`, `client/src/pages/Home.tsx`

**Dependencies:** None

**Prerequisites:** None

**Impacted modules:** Parcels router, Home page

**Likely files to change:**
- `server/parcels.db.ts` — add `getParcelStats(tenantId)` returning `{ total, pending, inTransit, delivered, failed }`
- `server/routers/parcels.ts` — add `stats` procedure
- `client/src/pages/Home.tsx` — replace `list` query with `stats` query

**Expected output:** Dashboard stats load from a single COUNT query, not a full table scan

**Acceptance criteria:**
- `parcels.stats` tRPC endpoint returns `{ total, pending, inTransit, delivered, failed }` in under 50ms
- Uses SQL `COUNT` with `WHERE status = ?` — no rows returned to application layer
- Home page no longer calls `parcels.list` for stats purposes
- Stats show correct numbers
- Skeleton loading state shown while stats load

**Tests required:**
- Unit test: `getParcelStats` returns correct counts with known fixture data
- Unit test: stats are tenant-scoped (different tenants get different numbers)
- Integration test: home page renders correct stat values

**Risks:** Low

**Important reminders:**
- The stats must be tenant-scoped (add `tenantId` filter to all COUNT queries)
- Add `IN_WAREHOUSE` to the `inTransit` count (it's in-progress)

---

### TASK-08: Implement Cursor-Based Pagination for Parcel List

**Title:** Add Cursor-Based Pagination to Parcel List Page

**Objective:** The parcel list is hardcoded to `limit: 50` with no UI to load more. Add cursor-based pagination (using `createdAt` + `id` as cursor) with a "Load More" button.

**Why it matters:** Tenants with large parcel volumes (100+ parcels/day) cannot see older parcels. This is a critical operational limitation.

**Repo scope:** Frontend + backend

**Dependencies:** None

**Impacted modules:** `parcels.ts` router, `parcels.db.ts`, `ParcelsList.tsx`

**Likely files to change:**
- `server/parcels.db.ts` — update `listParcels` to accept `cursor: { id: number; createdAt: Date } | null` and use it as a WHERE clause instead of OFFSET
- `server/routers/parcels.ts` — update `list` input schema to accept cursor
- `client/src/pages/ParcelsList.tsx` — add "Load More" button, accumulate results

**Expected output:** Parcel list shows first 20 results, with "Load More" button that fetches the next 20

**Acceptance criteria:**
- Default limit reduced from 50 to 20 (less bandwidth)
- "Load More" button appears when there are more results (check if response count === limit)
- Second page loads from cursor, not OFFSET (stable pagination even when new parcels added)
- Search results are not paginated (reasonable for most queries)
- Loading state on "Load More" button
- Empty state when no more results

**Tests required:**
- Unit test: `listParcels` with cursor returns correct next page
- Unit test: cursor-based pagination is stable under concurrent inserts
- Integration test: load more button fetches next page correctly

**Risks:** Low

**Important reminders:**
- Use cursor pagination (id + createdAt), not OFFSET — OFFSET is unstable with concurrent inserts
- The cursor must be opaque (base64 encoded) on the client side

---

### TASK-09: Fix Dispatch Agent Assignment

**Title:** Wire Real Agent Selection in Dispatch Page

**Objective:** The dispatch page currently passes `agentId: 1` hardcoded when assigning parcels to agents. Replace with a real agent dropdown populated from the users table.

**Why it matters:** Every dispatch assignment currently goes to the user with `id = 1` regardless of which agent is selected in the UI. This makes the dispatch system non-functional.

**Repo scope:** `client/src/pages/Dispatch.tsx`, `server/routers/dispatch.ts`

**Dependencies:** None

**Prerequisites:** None

**Impacted modules:** Dispatch page, dispatch DB layer, users query

**Likely files to change:**
- `server/routers/dispatch.ts` — add `listAgents` procedure that returns users with role `agent` or `admin`
- `client/src/pages/Dispatch.tsx` — replace hardcoded `agentId: 1` with value from the agent selection dropdown (the dropdown already exists in the ClusterCard component)

**Expected output:** Agent selection in the dispatch UI assigns to the actually selected agent

**Acceptance criteria:**
- Agent dropdown shows all active users (name + role)
- Selected agent ID is passed in the assignment mutation
- Assignment confirmed in DB with correct `assignedAgentId`
- Re-assigning replaces previous assignment
- UI shows assigned agent name on parcel card

**Tests required:**
- Integration test: dispatch assignment stores correct agentId in DB
- Integration test: agent list comes from real users table
- Edge case: no agents available → show empty state + helpful message

**Risks:** Low

**Important reminders:**
- Filter users to only those with `role = 'agent'` or `role = 'admin'`
- The `listAgents` procedure must be `protectedProcedure` (requires auth)

---

### TASK-10: Wire Parcel Event Bus to Cloudflare KV

**Title:** Connect the Internal Event Bus to Cloudflare KV Events Namespace

**Objective:** `server/eventBus.ts` currently only logs events. `wrangler.toml` already has an `EVENTS` KV namespace configured. Wire the event publisher to write to KV, and wire the consumer to read from it.

**Why it matters:** Without a real event bus, downstream services (commerce, notifications, analytics) cannot react to parcel state changes. The platform is event-driven by design — this is the core infrastructure gap.

**Repo scope:** `server/eventBus.ts`, `server/_core/index.ts`, new `server/events/parcelEventConsumer.ts`

**Dependencies:** Cloudflare Workers runtime (production only); in Express dev mode, use in-memory EventEmitter as fallback

**Prerequisites:** None

**Impacted modules:** eventBus, all routers that call `publishEvent`

**Likely files to change:**
- `server/eventBus.ts` — add KV publish implementation (write event to `EVENTS` KV with TTL)
- New `server/events/parcelEventConsumer.ts` — consume events from KV and route to handlers
- `server/_core/index.ts` — initialize consumer on startup

**Expected output:** Events are durably written to Cloudflare KV; consumers pick them up and trigger notifications/downstream actions

**Acceptance criteria:**
- `publishEvent` writes to `EVENTS` KV namespace in production (or in-memory queue in dev)
- Events include TTL (7 days — prevent unbounded KV growth)
- Consumer polls or is triggered via Cron Trigger
- Notification handler is called for `parcel.out_for_delivery` and `parcel.delivered` events
- Failed event delivery is retried up to 3 times
- Dead-letter logging for events that exceed max retries

**Tests required:**
- Unit test: `publishEvent` writes correct payload to KV mock
- Unit test: consumer correctly routes events to handlers
- Unit test: retry logic works on handler failure
- Integration test: full flow — create parcel → event published → consumer triggered → notification sent

**Risks:** Medium — requires Cloudflare Workers environment to fully test; add environment guards

**Important reminders:**
- Use the existing `createLogger` pattern for all logging
- KV key format: `event:{tenantId}:{eventType}:{nanoid}` for uniqueness
- Never use console.log

---

### TASK-11: Add CSRF Protection

**Title:** Add CSRF Protection to All State-Mutating Endpoints

**Objective:** No CSRF protection exists on any route. Add `SameSite=Strict` to session cookies and add origin validation middleware for all non-GET requests.

**Why it matters:** Without CSRF protection, an attacker can host a malicious website that triggers authenticated parcel mutations on behalf of logged-in users. This is an OWASP Top 10 vulnerability.

**Repo scope:** `server/_core/index.ts`, `server/_core/cookies.ts`

**Dependencies:** None — uses existing cookie infrastructure

**Impacted modules:** All mutating routes (tRPC mutations, webhook endpoints excluded)

**Likely files to change:**
- `server/_core/cookies.ts` — add `SameSite: "Strict"` to session cookie options
- `server/_core/index.ts` — add origin validation middleware for non-GET, non-webhook routes

**Expected output:** Session cookie set with `SameSite=Strict`; requests from unexpected origins are rejected

**Acceptance criteria:**
- Session cookie has `SameSite=Strict` attribute
- POST requests from non-allowed origins return 403
- Webhook endpoints are excluded from origin check (they come from external providers)
- Health check endpoints excluded
- Allowed origins configurable via environment variable

**Tests required:**
- Unit test: request from allowed origin passes
- Unit test: request from unknown origin returns 403
- Unit test: webhook endpoint bypasses origin check
- Unit test: session cookie includes SameSite=Strict

**Risks:** Medium — SameSite=Strict will break cross-site OAuth redirects if not handled correctly

**Important reminders:**
- OAuth callback must be excluded from SameSite restrictions
- Test thoroughly on mobile browsers — SameSite=Strict behavior varies

---

### TASK-12: Replace Math.random() with Crypto in Tracking Number and OTP

**Title:** Use Cryptographically Secure Random Numbers for Tracking Numbers and OTPs

**Objective:** Both `generateTrackingNumber` and `generateOtp` use `Math.random()`, which is predictable. Replace with `crypto.getRandomValues()`.

**Why it matters:** Predictable tracking numbers allow competitors to scan for competitor shipments. Predictable OTPs can be brute-forced without locking (since there's no attempt limit currently — see TASK-06).

**Repo scope:** `server/parcels.db.ts`, `server/otp.ts`

**Dependencies:** None — Node.js `crypto` is built-in

**Impacted modules:** Tracking number generation, OTP generation

**Likely files to change:**
- `server/parcels.db.ts` — `generateTrackingNumber()`: replace `Math.random().toString(36)` with `crypto.randomBytes(4).toString('hex').toUpperCase().slice(0,6)`
- `server/otp.ts` — `generateOtp()`: replace `Math.floor(Math.random() * 9000) + 1000` with `crypto.getRandomValues(new Uint32Array(1))[0] % 10000` padded to 4 digits

**Expected output:** All random values use CSPRNG

**Acceptance criteria:**
- `generateTrackingNumber` uses Node.js `crypto.randomBytes`
- `generateOtp` uses `crypto.getRandomValues` or `crypto.randomInt`
- OTP range is 0000-9999 (padded with leading zeros if needed) — not 1000-9999
- Existing tracking number format `WW-{YYYYMMDD}-{6CHAR}` is preserved
- All unit tests for these functions still pass

**Tests required:**
- Statistical test: 10,000 generated OTPs should include values < 1000 (proves range is 0000-9999)
- Statistical test: tracking number random component is 6 uppercase alphanumeric characters
- Existing unit tests must pass

**Risks:** Very low — drop-in replacement

---

### TASK-13: Add Audit Logging for All Write Operations

**Title:** Implement Structured Audit Log Table and Automatic Write Recording

**Objective:** No audit trail exists. Add an `audit_logs` table and middleware that automatically records every write mutation (create, update, delete) with actor, timestamp, before/after state, and IP address.

**Why it matters:** Nigeria's NDPR requires audit trails for data processing. Enterprise logistics customers require audit trails for compliance. Fraud investigation requires knowing who changed what and when.

**Repo scope:** `drizzle/schema.ts`, new `server/auditLog.ts`, all routers

**Dependencies:** TASK-01 (CI fix) should be done first

**Prerequisites:** None

**Impacted modules:** All tRPC mutations, webhooks

**Likely files to change:**
- `drizzle/schema.ts` — add `auditLogs` table: `id`, `tenantId`, `actorId`, `action`, `entity`, `entityId`, `before`, `after`, `ip`, `createdAt`
- New `server/auditLog.ts` — `recordAudit(ctx, action, entity, entityId, before?, after?)` helper
- `server/routers/parcels.ts` — call `recordAudit` in create, update, delete mutations
- `server/routers/riders.ts` — call `recordAudit` in KYC state changes
- New migration SQL for audit_logs table

**Expected output:** Every write mutation is recorded in the audit log with full context

**Acceptance criteria:**
- `audit_logs` table created with all required fields
- Every parcel create, status update, and delete has an audit entry
- Every rider KYC status change has an audit entry
- Audit records include before/after JSON blobs
- Audit log is append-only (no updates or deletes)
- Admin can query audit log via `admin.auditLog` tRPC procedure

**Tests required:**
- Unit test: `recordAudit` writes correct entry to DB
- Integration test: creating a parcel generates an audit log entry
- Integration test: status update generates an audit log entry with correct before/after
- Test: audit log entries are immutable (no update/delete operations exist)

**Risks:** Medium — adds latency to every write if synchronous; use async fire-and-forget

**Important reminders:**
- Audit log writes should be async (fire-and-forget) to avoid slowing down mutations
- Store `before` and `after` as JSON strings (SQLite TEXT column)
- Never log raw OTP codes in audit entries

---

### TASK-14: Implement OTP Security Hardening (6-digit, Rate Limiting, Resend)

**Title:** Harden OTP Security with 6-Digit Codes, Attempt Limiting, and Resend Flow

**Objective:**
1. Upgrade from 4-digit to 6-digit OTPs (100× larger search space)
2. Add attempt limiting (lock after 3 wrong attempts)
3. Add resend OTP with 60-second cooldown
4. Add rate limiting at the API level

**Why it matters:** 4-digit OTPs have only 10,000 combinations. Without attempt limiting, they can be brute-forced in 10,000 requests. For a delivery that might be worth ₦50,000+, this is a real attack vector.

**Repo scope:** `server/otp.ts`, `server/routers/parcels.ts`, `drizzle/schema.ts`, `client/src/pages/ParcelDetail.tsx`

**Dependencies:** TASK-12 (crypto random), TASK-05 (rate limiting)

**Prerequisites:** TASK-12 must be complete

**Impacted modules:** OTP generation, OTP verification, parcel detail page

**Likely files to change:**
- `server/otp.ts` — change OTP length from 4 to 6 digits
- `drizzle/schema.ts` — add `otpAttempts` (integer), `otpLockedAt` (timestamp) to `parcels` table
- `server/parcels.db.ts` — add helpers: `incrementOtpAttempts`, `lockOtp`, `resetOtpAttempts`
- `server/routers/parcels.ts` — `verifyOtp`: check attempts, lock after 3, add `resendOtp` procedure
- `client/src/pages/ParcelDetail.tsx` — update OTP input to 6 digits, add resend button with countdown

**Expected output:** 6-digit OTPs with 3-attempt lockout and 60-second resend cooldown

**Acceptance criteria:**
- OTP is 6 digits (000000-999999)
- 3 failed attempts locks the OTP (returns `locked` error)
- Admin or system can unlock OTP (via re-triggering `OUT_FOR_DELIVERY` status)
- Resend OTP generates a new OTP (invalidates old) after 60-second cooldown
- Client shows 6-digit input field
- Client shows resend countdown timer
- All existing OTP unit tests updated for 6-digit codes

**Tests required:**
- Unit test: 3rd failed attempt triggers lockout
- Unit test: locked OTP returns error regardless of correct code
- Unit test: resend generates new OTP and invalidates old
- Unit test: resend before 60s returns cooldown error
- Integration test: full OTP flow with 6 digits

**Risks:** Medium — schema change requires migration; all existing OTPs in DB are 4-digit hash (they expire, so migration is safe)

**Important reminders:**
- The offline HMAC token must also be regenerated for 6-digit codes
- Update the `@webwaka/core` Termii message template to mention "6-digit" instead of "4-digit"
- The Dexie `otpCache` offline token must be invalidated and regenerated

---

### TASK-15: Implement Cash on Delivery (COD) Tracking

**Title:** Add COD Amount, Collection Status, and Reconciliation to Parcel Schema

**Objective:** Cash on Delivery is the dominant payment method in Nigeria. Add COD support: COD amount field, collection status (pending/collected/waived), and a reconciliation view for operations.

**Why it matters:** Without COD tracking, riders collect cash with no accountability. This is both a fraud risk and an operational gap. Most Nigerian logistics businesses lose 5-15% of COD revenue to unrecorded collections.

**Repo scope:** Backend + Frontend (Phase 1: schema + API; Phase 2: UI)

**Dependencies:** None

**Prerequisites:** TASK-07 (stats endpoint), TASK-08 (pagination) should ideally be done first

**Impacted modules:** Schema, parcels router, parcel detail page, home page stats

**Likely files to change:**
**Phase 1:**
- `drizzle/schema.ts` — add `codAmountKobo` (integer, nullable), `codStatus` (enum: `none`/`pending`/`collected`/`waived`), `codCollectedAt` (timestamp)
- `server/parcels.db.ts` — add `updateCodStatus` helper
- `server/routers/parcels.ts` — add `collectCod` mutation (marks COD as collected at delivery time)
- New migration SQL

**Phase 2:**
- `client/src/pages/CreateParcel.tsx` — add COD amount input
- `client/src/pages/ParcelDetail.tsx` — show COD status, collect button for riders
- New `client/src/pages/CodReconciliation.tsx` — daily COD summary for operations

**Expected output (Phase 1):** Schema and API support for COD
**Expected output (Phase 2):** UI for COD collection and reconciliation

**Acceptance criteria (Phase 1):**
- `codAmountKobo` can be set during parcel creation (optional)
- `codStatus` defaults to `none` (when codAmountKobo is 0 or null)
- `codStatus` transitions: `none` → stays `none` (no COD); `pending` → `collected` or `waived`
- `collectCod` mutation only allowed on `DELIVERED` parcels
- `codCollectedAt` timestamp recorded on collection

**Tests required:**
- Unit test: COD amount stored correctly in kobo
- Unit test: COD status transitions (none/pending/collected/waived)
- Integration test: create parcel with COD → deliver → collect
- Test: cannot collect COD on undelivered parcel

**Risks:** Medium — schema migration; existing parcels get `codStatus = 'none'` by default

---

### TASK-16: Automated Rider License Expiry Monitoring

**Title:** Implement License Expiry Detection and Auto-Suspension for Riders

**Objective:** The `riders` table has `licenseExpiresAt` but nothing checks it. Add a background job that detects expiring licenses and suspends riders automatically.

**Why it matters:** Allowing riders with expired licenses to operate creates legal liability for the logistics company. In Nigeria, this can result in regulatory penalties.

**Repo scope:** `server/routers/riders.ts`, new `server/jobs/licenseExpiryJob.ts`

**Dependencies:** TASK-10 (event bus, for triggering notifications)

**Prerequisites:** None — the `licenseExpiresAt` field already exists

**Impacted modules:** Riders DB, KYC status, notification system

**Likely files to change:**
- New `server/jobs/licenseExpiryJob.ts` — check for riders whose license expires within 14 days or has already expired
- `server/_core/index.ts` — schedule the job to run daily
- `server/riders.db.ts` — add `getRidersWithExpiringLicenses(tenantId, daysAhead)` query
- `server/routers/riders.ts` — add `getSuspendedRiders` admin procedure

**Expected output:** Riders with expired licenses are automatically suspended; those expiring within 14 days receive a notification

**Acceptance criteria:**
- Riders with `licenseExpiresAt < now()` get `kycStatus = 'SUSPENDED'` (new status)
- Riders with `licenseExpiresAt < now() + 14 days` get an SMS notification via Termii
- Job runs daily (via setInterval in Express dev, Cloudflare Cron in production)
- Admin dashboard shows number of suspended riders
- Rider can submit renewed license to re-enter VERIFYING state

**Tests required:**
- Unit test: `getRidersWithExpiringLicenses` returns correct riders
- Unit test: job suspends expired riders correctly
- Unit test: job does not suspend riders with valid licenses
- Integration test: full expiry detection + suspension flow

**Risks:** Medium — requires `SUSPENDED` as a new `kycStatus` enum value

**Important reminders:**
- Add `SUSPENDED` to the `RIDER_KYC_STATUS` enum in schema
- The suspension should not be retroactive on old data (apply from this release forward)

---

### TASK-17: Multi-Channel Status Notifications (SMS to Recipients)

**Title:** Send SMS Notifications to Parcel Recipients at Key Status Transitions

**Objective:** Recipients currently receive no communication except the OTP. Add automatic SMS notifications at: `OUT_FOR_DELIVERY` (rider is on the way) and `DELIVERED` (parcel delivered).

**Why it matters:** In Nigeria, parcel recipients expect to be informed proactively. Without notifications, support call volume is high. This is a basic expectation of any modern logistics service.

**Repo scope:** `server/eventBus.ts` consumer, `server/_core/notification.ts`

**Dependencies:** TASK-10 (event bus wiring)

**Prerequisites:** `TERMII_API_KEY` environment variable must be configured

**Impacted modules:** Event bus consumer, notification service, parcels router

**Likely files to change:**
- `server/_core/notification.ts` — add `sendRecipientSms(phone, message)` function using Termii
- `server/eventBus.ts` — add consumer for `parcel.out_for_delivery` and `parcel.delivered` events
- `server/routers/parcels.ts` — trigger event on `addUpdate` when status is `OUT_FOR_DELIVERY` or `DELIVERED`

**Expected output:** Recipients automatically receive an SMS when their parcel is out for delivery and when it is delivered

**Acceptance criteria:**
- SMS sent to `recipientPhone` when status changes to `OUT_FOR_DELIVERY`: "Your parcel {trackingNumber} is on the way! Your rider will arrive soon."
- SMS sent to `recipientPhone` when status changes to `DELIVERED`: "Your parcel {trackingNumber} has been delivered. If you have questions, contact your sender."
- SMS is in English by default; Nigeria-First: add Yoruba/Hausa templates
- Failure to send SMS is logged but does NOT fail the status update
- SMS sending is async (fire-and-forget) — does not slow status update

**Tests required:**
- Unit test: `OUT_FOR_DELIVERY` event triggers SMS to correct phone number
- Unit test: SMS failure does not throw or block status update
- Unit test: SMS message contains tracking number
- Mock Termii API in tests

**Risks:** Low — fire-and-forget async notification

**Important reminders:**
- Never fail a parcel status update because of an SMS failure
- Log all SMS sends (success and failure) to structured logger

---

### TASK-18: Improve Service Worker with Cache Versioning

**Title:** Add Automatic Cache Versioning to Service Worker

**Objective:** The service worker has a hardcoded cache name `webwaka-logistics-v1`. This means new deployments never invalidate old cached assets. Users see stale UI after updates.

**Why it matters:** Riders on the field may be running stale code for days after a deployment. Critical bug fixes don't reach them. In offline-first PWAs, cache management is critical.

**Repo scope:** `client/public/sw.js`, build pipeline

**Dependencies:** None

**Prerequisites:** None

**Impacted modules:** Service worker, Vite build config

**Likely files to change:**
- `client/public/sw.js` — replace hardcoded version with `__CACHE_VERSION__` placeholder
- `vite.config.ts` — inject current build timestamp as `__CACHE_VERSION__` using `define`
- `client/src/App.tsx` — add service worker update detection and "Update Available" banner

**Expected output:** Every new deployment produces a new cache version; users are prompted to reload when an update is available

**Acceptance criteria:**
- Cache name includes build timestamp (e.g., `webwaka-logistics-1743771234`)
- Old caches are cleaned up on service worker activation
- When a new service worker is detected, an "Update Available" banner appears in the UI
- Clicking the banner triggers `skipWaiting` and reloads the page
- Stale assets are never served after a deployment once the user acknowledges the update

**Tests required:**
- Unit test: new cache version is different from previous version
- Integration test: old cache entries are cleaned up on new SW activation
- Manual test: deploy → old device loads → banner appears → click update → new version loads

**Risks:** Low

**Important reminders:**
- The `__CACHE_VERSION__` injection must happen at build time, not runtime
- Test on both Android Chrome and iOS Safari (service worker behavior differs)

---

### TASK-19: Complete i18n Translation Coverage

**Title:** Complete All Missing Translation Keys for Yoruba, Igbo, and Hausa

**Objective:** The i18n file has English as the complete reference, but Yoruba, Igbo, and Hausa translations have many missing or placeholder strings. Audit and complete all missing translations.

**Why it matters:** Nigeria-First is a core platform principle. Riders in Kano speak Hausa; riders in Enugu speak Igbo. Incomplete translations break the user experience for large rider segments.

**Repo scope:** `client/src/lib/i18n.ts`, `client/src/contexts/I18nContext.tsx`

**Dependencies:** None

**Prerequisites:** None

**Impacted modules:** All UI text, i18n context

**Likely files to change:**
- `client/src/lib/i18n.ts` — complete all missing translations for `yo`, `ig`, `ha` locales
- Verify new strings added in T-LOG-04 (warehouse scanner) and T-LOG-05 (rider KYC) are in all locales

**Expected output:** All UI strings have correct translations in all four languages

**Acceptance criteria:**
- No translation key returns its English fallback when Yoruba/Igbo/Hausa is selected
- All new feature strings (warehouse scanner, OTP, rider KYC, dispatch) translated
- Language switcher allows selecting any language and all text updates immediately
- WAT datetime formatting is locale-aware (en-NG, yo-NG, ig-NG, ha-NG)

**Tests required:**
- Automated check: all translation keys present in all 4 locales (TypeScript type check enforces this already)
- Manual review by native Yoruba, Igbo, and Hausa speakers (quality of translation, not just presence)
- UI test: switch to each language, verify no English text appears

**Risks:** Low for code; translation accuracy requires human review

**Important reminders:**
- Use professional translation or community validation — machine translation for Nigerian languages is often poor
- Do NOT use Google Translate for Yoruba/Igbo/Hausa — accuracy is too low for logistics-critical text

---

### TASK-20: Add NDPR Compliance Module

**Title:** Implement NDPR Compliance: Consent, Data Access, and Deletion

**Objective:** Nigeria Data Protection Regulation (NDPR) requires: (1) explicit consent for data processing, (2) data subject access request handling, (3) data subject deletion request handling, (4) breach notification process. Add a compliance module.

**Why it matters:** NDPR fines can reach ₦10 million or 2% of annual gross revenue. Enterprise logistics customers will not onboard without NDPR compliance documentation and tooling.

**Repo scope:** Backend + Frontend (Phase 1: backend procedures; Phase 2: UI)

**Dependencies:** TASK-13 (audit logging)

**Prerequisites:** None

**Impacted modules:** Schema, new compliance router, all PII-containing tables

**Likely files to change:**
**Phase 1:**
- New `server/routers/compliance.ts` — tRPC procedures: `requestDataExport`, `requestDeletion`, `recordConsentGiven`
- `drizzle/schema.ts` — add `consentLog` table: `id`, `tenantId`, `userId`, `consentType`, `consentText`, `givenAt`, `ipAddress`
- New SQL migration

**Phase 2:**
- New `client/src/pages/PrivacyCenter.tsx` — user-facing consent and data management page
- `client/src/pages/PublicTracking.tsx` — NDPR consent banner (already has a notice, upgrade to interactive consent)

**Expected output (Phase 1):** API endpoints for data export, deletion, and consent recording

**Acceptance criteria:**
- `compliance.requestDataExport` returns all data associated with a user (parcels, PODs, OTP logs)
- `compliance.requestDeletion` anonymizes PII in parcels, riders, and users tables (soft delete + field nullification)
- `compliance.recordConsentGiven` records consent with timestamp and IP
- Export and deletion requests are audited (in audit_logs)
- Deletion does NOT delete parcel records (financial records must be retained for 7 years per FIRS requirements)
- Deletion anonymizes: name, phone, address fields (replaces with `[ANONYMIZED]`)

**Tests required:**
- Unit test: data export returns all associated records
- Unit test: deletion anonymizes PII without deleting financial records
- Unit test: consent log records correct timestamp and consent text
- Legal review: verify anonymization approach meets NDPR's right-to-erasure standard

**Risks:** High — legal risk if done incorrectly; requires legal team review

**Important reminders:**
- Financial records (parcels, deliveries, payments) must be retained per Nigerian tax law (FIRS)
- Deletion means anonymization of PII, not deletion of transaction records
- Consult NDPR guidelines from NITDA (National Information Technology Development Agency)

---

## 7. QA PLANS

---

### QA-01: CI/CD Fix (TASK-01)

**What to verify:**
- All four workflow YAML files contain zero references to `pnpm`
- `npm ci` is used (not `npm install`) for reproducible builds
- Node.js 20 is specified in all workflows
- Cache uses `package-lock.json` (npm cache, not pnpm)

**Bugs to look for:**
- pnpm setup step still present
- `pnpm-lock.yaml` referenced in cache key
- `npm install` used instead of `npm ci`
- Wrong Node.js version

**Edge cases:**
- Workflows that only partially updated (test passes but deploy fails)
- Cache invalidation: if old pnpm cache was primed, ensure npm cache is fresh

**Regressions to detect:**
- Build time regression (npm is slightly slower than pnpm for fresh installs)
- Missing build artifacts in deployment pipeline

**Cross-repo/cross-module:**
- Verify that the `@webwaka/core` package resolves correctly via npm (it's a local package reference)

**Deployment checks:**
- Trigger a real PR after the fix and confirm the green checkmark appears on all workflow checks

**Done means:** Every CI check in GitHub passes on a test PR with no pnpm-related errors.

---

### QA-02: Manus Artifact Removal (TASK-02)

**What to verify:**
- `localStorage.getItem("manus-runtime-user-info")` returns `null` after login
- No `manus-runtime` references remain anywhere in the codebase (grep check)
- `useAuth` hook returns same shape as before
- All pages that use `useAuth` still render correctly

**Bugs to look for:**
- Residual localStorage writes in other files
- Any component that reads from `manus-runtime-user-info` localStorage key

**Edge cases:**
- User logged in before the fix (old value may be in localStorage) — verify it's harmless
- Users who clear localStorage — no breakage

**Done means:** No user data written to localStorage in any auth flow; all auth-protected pages function correctly.

---

### QA-03: Status Transition Fix (TASK-03)

**What to verify:**
- `isValidTransition("IN_WAREHOUSE", "IN_TRANSIT")` → `true`
- `isValidTransition("IN_WAREHOUSE", "FAILED")` → `true`
- `isValidTransition("IN_WAREHOUSE", "DELIVERED")` → `false`
- `isValidTransition("COLLECTED", "IN_WAREHOUSE")` → `true`
- Existing transitions unchanged

**Bugs to look for:**
- New transition accidentally removed an existing valid transition
- IN_WAREHOUSE added but COLLECTED → IN_WAREHOUSE not added

**Regressions:**
- Run full transition matrix test: every status × every status

**Done means:** All unit tests pass; a parcel can be scanned at warehouse and then dispatched.

---

### QA-04: HMAC Webhook Verification (TASK-04)

**What to verify:**
- Valid HMAC signature → 200 OK
- Invalid signature → 401
- Missing signature header → 401
- Replayed request (correct signature, already processed) → 200 (idempotent)
- Raw body is available before JSON parsing

**Bugs to look for:**
- Middleware ordering issue where JSON parser consumes body before HMAC check
- Timing attack: ensure `timingSafeEqual` is used, not string equality
- Webhook secret not set → behavior in dev vs prod (should warn-and-allow in dev only)

**Edge cases:**
- Empty body webhook (provider sends ping with no payload)
- UTF-8 body encoding for HMAC computation
- Base64 vs hex HMAC encoding (check each provider's spec)

**Cross-repo notes:**
- GIG, Kwik, Sendbox each have their own signature schemes — verify correct algorithm per provider

**Done means:** No webhook can be processed without a valid HMAC signature; all three providers tested with their real signature schemes.

---

### QA-05: Rate Limiting (TASK-05)

**What to verify:**
- 31st request to `/track` in a 60-second window → 429
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) present
- Cloudflare IP (`CF-Connecting-IP`) used as the rate limit key, not `req.ip`
- Different limits for different route groups

**Bugs to look for:**
- Rate limiting applied to webhook endpoints (breaks provider integration)
- Rate limiting applied to health check (breaks Cloudflare health probes)
- IP extraction incorrect behind Cloudflare proxy

**Edge cases:**
- IPv6 addresses
- Rate limit not applied to trusted Cloudflare IPs

**Done means:** Public tracking returns 429 after 30 requests/minute per IP; no legitimate traffic is blocked.

---

### QA-06: Digital Signature (TASK-06)

**What to verify:**
- SignaturePad renders and accepts touch input
- Clear button resets canvas
- Empty signature (no strokes) is rejected on submit
- Captured signature stored in R2
- `signatureUrl` populated in `proof_of_delivery` table
- Signature visible on ParcelDetail POD card

**Bugs to look for:**
- Touch events not registering on Android Chrome
- Canvas size incorrect on high-DPI screens (retina display artifacts)
- Base64 encoding of PNG too large (compress if needed)
- iOS Safari canvas issues

**Edge cases:**
- Rider's finger accidentally taps canvas once (creates a dot — should this be considered a valid signature?)
- Canvas exported while in portrait vs landscape orientation

**Done means:** POD requires both photo and signature; both are stored and visible on the parcel detail page.

---

### QA-07: Stats Endpoint (TASK-07)

**What to verify:**
- `parcels.stats` returns `{ total, pending, inTransit, delivered, failed }` matching actual DB counts
- Response time under 50ms for a 10,000-row table
- Stats are tenant-scoped
- Home page renders stats without loading individual parcels

**Bugs to look for:**
- Stats include soft-deleted parcels (must filter `deletedAt IS NULL`)
- Stats not updated in real-time (acceptable — polling is fine)
- `inTransit` count misses `IN_WAREHOUSE` status

**Done means:** Home page loads stats in under 100ms via COUNT queries; no individual parcel rows returned.

---

### QA-08: Pagination (TASK-08)

**What to verify:**
- First 20 parcels load correctly
- "Load More" fetches next 20 using cursor (not offset)
- When no more results, "Load More" button disappears or is disabled
- Search is not paginated (shows all matching results up to reasonable limit)
- Cursor is stable when new parcels are created during pagination

**Bugs to look for:**
- Cursor pagination skips records at page boundary
- Infinite loop if "Load More" always thinks there are more results
- Cursor contains sensitive data (should be opaque/base64)

**Done means:** Users can scroll through all their parcels via load more; no records are skipped or duplicated.

---

### QA-09: Agent Assignment Fix (TASK-09)

**What to verify:**
- Agent dropdown shows real agents from DB
- Selecting agent X and clicking assign stores `assignedAgentId = X.id` in DB
- Re-assigning changes the stored agent ID
- Assigned agent name visible on cluster card

**Bugs to look for:**
- Agent list includes deactivated or irrelevant users
- Agent dropdown shows internal user IDs (not names) to users

**Done means:** Parcels are assigned to the correctly selected agent; previous hardcode of `agentId: 1` is gone.

---

### QA-10: Event Bus Wiring (TASK-10)

**What to verify:**
- `publishEvent` writes to KV in production (verify KV entry exists)
- Consumer reads and processes the event
- Event includes all required fields (tenantId, parcelId, trackingNumber, event, timestamp)
- Failed event delivery is retried up to 3 times
- Dead-letter events are logged

**Bugs to look for:**
- Events written to wrong KV namespace
- TTL not set (KV fills up)
- Consumer triggered but no handler registered

**Cross-repo notes:**
- Commerce events (`commerceEventBus`) should NOT be replaced — only parcel-domain events go through this bus
- KYC events have their own bus

**Done means:** A parcel status update publishes an event to KV; a consumer processes it; notification is sent.

---

## 8. IMPLEMENTATION PROMPTS

---

### IMPL-PROMPT-01: Fix CI/CD Workflows

```
REPO: webwaka-logistics
TASK: Fix GitHub Actions CI/CD Workflows — Replace pnpm with npm

CONTEXT:
You are working in the webwaka-logistics repository, which is one component of the WebWaka multi-repo logistics platform. This repo has recently migrated from pnpm to npm. All GitHub Actions workflows in .github/workflows/ still reference pnpm, causing all CI checks to fail.

ECOSYSTEM CAVEAT:
This repo depends on @webwaka/core (local package), external OAuth server, and Cloudflare D1/R2/KV. The CI fix is isolated to the workflow files only and does not touch any of these integrations.

IMPORTANT REMINDERS:
- Build Once Use Infinitely: do not add any new npm scripts. Use existing scripts only.
- CI/CD Native Development: make CI the source of truth for build correctness.
- Zero Skipping Policy: fix all four workflow files — test.yml, deploy-prod.yml, deploy-staging.yml, preview-pr.yml.
- Thoroughness Over Speed: verify each workflow file is complete and valid YAML.

INSTRUCTIONS:
1. Read all four workflow files in .github/workflows/
2. Replace ALL pnpm references:
   - Remove "Setup pnpm" steps (pnpm/action-setup@v4)
   - Replace `pnpm install --frozen-lockfile` with `npm ci`
   - Replace `pnpm run test` with `npm run test`
   - Replace `pnpm run build` with `npm run build`
   - Update Node.js cache from `pnpm` to `npm`
   - Update cache key to use `package-lock.json` not `pnpm-lock.yaml`
3. Do NOT change any other aspects of the workflows
4. Validate YAML syntax after changes

REQUIRED DELIVERABLES:
- All four workflow files updated
- Zero pnpm references remaining
- Valid YAML syntax confirmed
- Comment explaining the migration in each file header

ACCEPTANCE CRITERIA:
- `grep -r "pnpm" .github/` returns no results
- npm ci, npm run test, npm run build present in correct places
- Node 20 cache uses package-lock.json

TESTS / VERIFICATION:
- Create a test branch, push it, and confirm GitHub Actions runs without pnpm errors
- Confirm test workflow picks up and runs the Vitest test suite

DO NOT:
- Modify package.json scripts
- Add new workflow steps
- Change deployment targets or secrets
- Use shortcuts or placeholders
```

---

### IMPL-PROMPT-02: Remove Manus Artifact

```
REPO: webwaka-logistics
TASK: Remove Manus-Specific localStorage Artifact from useAuth Hook

CONTEXT:
You are working in the webwaka-logistics repository. The useAuth hook at client/src/_core/hooks/useAuth.ts contains a development artifact from the Manus platform: localStorage.setItem("manus-runtime-user-info", JSON.stringify(meQuery.data)). This must be removed from production code as it leaks sensitive user data to localStorage.

ECOSYSTEM CAVEAT:
This hook is shared infrastructure used by all protected pages. Be careful not to change the hook's public API or break any dependent components.

IMPORTANT REMINDERS:
- NDPR compliance: sensitive user data must not be written to browser localStorage unencrypted
- Nigeria-First: riders and agents access this app on shared devices — localStorage persists across sessions
- Zero Skipping Policy: search the entire codebase for any other manus-runtime references

INSTRUCTIONS:
1. Read client/src/_core/hooks/useAuth.ts in full
2. Locate the useMemo for `state` — it contains the localStorage.setItem call
3. Remove ONLY that localStorage.setItem line
4. Search the entire codebase for "manus-runtime" — remove all occurrences
5. Verify the hook still returns the same shape: { user, loading, error, isAuthenticated, refresh, logout }
6. Do NOT change any other logic in the hook

REQUIRED DELIVERABLES:
- useAuth.ts with localStorage.setItem removed
- Full codebase search results showing zero manus-runtime references

ACCEPTANCE CRITERIA:
- No localStorage.setItem calls in any auth-related hook
- No "manus-runtime" string anywhere in the codebase
- useAuth hook exports same API and all pages still work
- TypeScript compiles with zero errors (npm run check)

TESTS:
- Log in and verify localStorage does not contain manus-runtime-user-info key
- Verify all protected pages still render correctly after login
```

---

### IMPL-PROMPT-03: Fix Status Transition Map

```
REPO: webwaka-logistics
TASK: Add IN_WAREHOUSE to Status Transition Map (VALID_TRANSITIONS)

CONTEXT:
You are working in the webwaka-logistics repository. The parcel status IN_WAREHOUSE was added by T-LOG-04 (Warehouse Receiving Scanner) but was never added to VALID_TRANSITIONS in server/parcels.utils.ts. This means parcels received at the warehouse cannot be moved to IN_TRANSIT, blocking the warehouse-to-dispatch operational flow.

ECOSYSTEM CAVEAT:
The status machine is used by both the parcels tRPC router (server-side validation) and indirectly by the client (optimistic updates). Changes must be consistent everywhere.

IMPORTANT REMINDERS:
- Multi-Tenant: all transition checks are tenant-scoped by the parcelId lookup
- Event-Driven: status updates publish events to the event bus — do not remove that logic
- The IN_WAREHOUSE status is in the PARCEL_STATUS enum in drizzle/schema.ts — verify before adding

INSTRUCTIONS:
1. Read server/parcels.utils.ts in full
2. Read drizzle/schema.ts to confirm IN_WAREHOUSE is in PARCEL_STATUS enum
3. Add IN_WAREHOUSE to VALID_TRANSITIONS: { IN_WAREHOUSE: ["IN_TRANSIT", "FAILED"] }
4. Also verify COLLECTED → IN_WAREHOUSE is present (COLLECTED parcels arrive at warehouse)
   - If missing, add: update COLLECTED transitions to include "IN_WAREHOUSE"
5. Read server/parcels.test.ts and add test cases for IN_WAREHOUSE transitions
6. Run npm run test to confirm all tests pass

REQUIRED DELIVERABLES:
- Updated VALID_TRANSITIONS in server/parcels.utils.ts
- New unit tests for IN_WAREHOUSE transitions
- All existing tests still passing

ACCEPTANCE CRITERIA:
- isValidTransition("IN_WAREHOUSE", "IN_TRANSIT") === true
- isValidTransition("IN_WAREHOUSE", "FAILED") === true
- isValidTransition("IN_WAREHOUSE", "DELIVERED") === false
- isValidTransition("COLLECTED", "IN_WAREHOUSE") === true
- npm run test passes with all tests green

TESTS:
Run: npm run test
Expected: All tests pass including new IN_WAREHOUSE transition tests
```

---

### IMPL-PROMPT-04: HMAC Webhook Signature Verification

```
REPO: webwaka-logistics
TASK: Replace All Webhook Signature Checks with HMAC-SHA256

CONTEXT:
You are working in the webwaka-logistics repository. Three provider webhook handlers exist:
- server/webhooks/providers/gig.ts — uses simple header string equality (trivially spoofable)
- server/webhooks/providers/kwik.ts — no signature verification at all
- server/webhooks/providers/sendbox.ts — no signature verification at all
All three must be upgraded to HMAC-SHA256 verification using the raw request body.

ECOSYSTEM CAVEAT:
The webhook handlers receive events from external providers (GIG Express, Kwik Delivery, Sendbox). Each provider has their own signature scheme. The Express body parser must be configured to provide the raw body to these handlers BEFORE consuming it as JSON.

IMPORTANT REMINDERS:
- Security First: use crypto.timingSafeEqual() — not string equality — to prevent timing attacks
- Nigeria-First: GIG is the largest Nigerian courier — their webhook is highest priority
- Multi-Tenant: webhook payloads include tenantId — verify it matches the expected tenant
- Cloudflare-First: in production, Cloudflare Workers environment uses the Web Crypto API, not Node crypto

INSTRUCTIONS:
1. Read server/webhooks/webhookRouter.ts and all three provider handlers
2. Read server/_core/index.ts to understand how middleware is configured
3. Create a shared utility function verifyHmacSignature(rawBody: Buffer, secret: string, signature: string): boolean using crypto.timingSafeEqual
4. Update server/_core/index.ts to use express.raw() middleware for /api/webhooks routes (instead of express.json())
5. Pass req.body (Buffer) to each webhook handler
6. Parse JSON from the buffer inside the handler, not via middleware
7. Implement HMAC-SHA256 verification in each provider:
   - GIG: check x-gig-signature header; use HMAC-SHA256(GIG_WEBHOOK_SECRET, rawBody)
   - Kwik: check x-kwik-signature header; use HMAC-SHA256(KWIK_WEBHOOK_SECRET, rawBody)
   - Sendbox: check x-sendbox-signature header; use HMAC-SHA256(SENDBOX_WEBHOOK_SECRET, rawBody)
8. If the secret env var is not set: log a warning with createLogger and return true only in NODE_ENV=development
9. Add unit tests in server/__tests__/gigWebhook.test.ts for valid/invalid signatures

REQUIRED DELIVERABLES:
- verifyHmacSignature utility (shared)
- Updated gig.ts, kwik.ts, sendbox.ts
- Updated express middleware ordering in index.ts
- Unit tests for signature verification
- ENV documentation: GIG_WEBHOOK_SECRET, KWIK_WEBHOOK_SECRET, SENDBOX_WEBHOOK_SECRET

ACCEPTANCE CRITERIA:
- Valid HMAC signature → 200 OK
- Invalid signature → 401 with JSON error
- Missing signature → 401
- crypto.timingSafeEqual used (not ===)
- Raw body available for HMAC computation
- npm run test passes

DO NOT:
- Use console.log anywhere — use createLogger
- Trust the tenantId from the webhook payload without cross-checking with the stored delivery request
```

---

### IMPL-PROMPT-05: Rate Limiting

```
REPO: webwaka-logistics
TASK: Add Per-IP Rate Limiting to Public and API Endpoints

CONTEXT:
You are working in the webwaka-logistics repository. No rate limiting exists on any endpoint. The public tracking endpoint (/api/trpc/parcels.trackPublic) is especially vulnerable to abuse.

ECOSYSTEM CAVEAT:
In production, traffic arrives through Cloudflare which provides IP information via CF-Connecting-IP header. Rate limiting must use this header as the key, not req.ip (which will be a Cloudflare edge IP).

IMPORTANT REMINDERS:
- Cloudflare-First: Cloudflare Workers supports rate limiting natively in production. In Express dev, use express-rate-limit.
- Do NOT rate-limit webhook endpoints — external providers need reliable access
- Do NOT rate-limit health checks

INSTRUCTIONS:
1. Install express-rate-limit: run npm install express-rate-limit
2. Create server/_core/rateLimit.ts with configurations:
   - publicRateLimit: 30 req/min per IP (for public tracking)
   - authRateLimit: 10 req/min per IP (for auth endpoints)
   - apiRateLimit: 200 req/min per IP (for general tRPC API)
3. Add a custom keyGenerator that uses req.headers['cf-connecting-ip'] || req.ip
4. Apply limits in server/_core/index.ts:
   - publicRateLimit applied to routes starting with /api/trpc/parcels.trackPublic
   - authRateLimit applied to /api/oauth and /api/trpc/auth.*
   - apiRateLimit applied to all /api/trpc/* not already rate-limited
5. Exclude: /api/webhooks/*, /health
6. Return 429 with JSON { error: "Too many requests", retryAfter: N }
7. Add Retry-After header to all 429 responses

REQUIRED DELIVERABLES:
- server/_core/rateLimit.ts with all limit configurations
- Updated server/_core/index.ts with limits applied
- package.json with express-rate-limit added (do this via npm install, not manually)

ACCEPTANCE CRITERIA:
- 31st request to trackPublic in 60s returns 429
- Webhook endpoints not rate-limited
- CF-Connecting-IP used as key
- Retry-After header present on 429 responses
- npm run test passes

DO NOT:
- Apply rate limiting to webhook routes
- Block Cloudflare health probes
```

---

### IMPL-PROMPT-06: Digital Signature Capture

```
REPO: webwaka-logistics
TASK: Implement Canvas-Based Digital Signature Capture for Proof of Delivery

CONTEXT:
You are working in the webwaka-logistics repository. The POD schema already accepts signatureBase64 (optional string). The server already stores signatures in R2 via storagePut. The client needs a touch-friendly canvas signature component.

ECOSYSTEM CAVEAT:
This is a client-only feature. The backend already supports signatures — no backend changes needed.

IMPORTANT REMINDERS:
- Mobile/PWA/Offline First: Signature pad must work on Android touch screens (moto, Samsung, Tecno — common in Nigeria). Use touchstart, touchmove, touchend alongside mouse events.
- Nigeria-First: Most deliveries happen at residential doors. Signature pads must work in outdoor lighting (high contrast: black ink on white background).
- Thoroughness Over Speed: Empty/dot signatures must be rejected. Minimum stroke length validation required.

INSTRUCTIONS:
1. Create client/src/components/SignaturePad.tsx:
   - Canvas element, 100% width, fixed height (200px)
   - Black strokes on white background
   - Event listeners: mousedown/mousemove/mouseup AND touchstart/touchmove/touchend
   - Clear button (top right corner)
   - hasSignature() check: returns false if no strokes drawn
   - capture() method: returns Promise<string> — base64-encoded PNG
   - onCapture prop: callback called with base64 string when user confirms
2. Integrate into client/src/pages/ParcelDetail.tsx in the POD submission flow:
   - After photo capture (CameraPOD), show SignaturePad
   - "Confirm" button only enabled when both photo and signature captured
   - Pass signatureBase64 to parcels.submitPOD mutation
3. Show captured signature as a small preview image on the POD card after submission

REQUIRED DELIVERABLES:
- client/src/components/SignaturePad.tsx
- Updated client/src/pages/ParcelDetail.tsx
- TypeScript compiles with zero errors

ACCEPTANCE CRITERIA:
- Signature pad renders on mobile
- Clear button resets canvas
- Empty signature rejected (hasSignature() = false)
- captured base64 PNG stored in R2 via existing submitPOD flow
- signatureUrl populated in proof_of_delivery table
- Signature preview shown on ParcelDetail after POD
- npm run check passes (no TypeScript errors)
- npm run build succeeds

DO NOT:
- Add any npm packages for the signature pad — use HTML5 Canvas API only
- Store raw image in the database (store in R2, store URL in DB)
```

---

### IMPL-PROMPT-07: Stats/Analytics Endpoint

```
REPO: webwaka-logistics
TASK: Create Dedicated Aggregation Endpoint for Dashboard Statistics

CONTEXT:
You are working in the webwaka-logistics repository. The Home page at client/src/pages/Home.tsx currently loads 100 parcels (limit: 100) just to compute 4 statistics. This is extremely wasteful. Create a dedicated parcels.stats tRPC endpoint that runs SQL COUNT queries instead.

IMPORTANT REMINDERS:
- Multi-Tenant: all stats queries must be scoped by tenantId
- Include IN_WAREHOUSE in inTransit count (it's an in-progress state)
- Soft deletes: all queries must filter WHERE deletedAt IS NULL
- Performance: COUNT queries should run in under 50ms on D1

INSTRUCTIONS:
1. Add getParcelStats(tenantId: string) to server/parcels.db.ts:
   - Run separate COUNT queries for each status group
   - Return: { total, pending, inTransit, delivered, failed }
   - inTransit includes: IN_TRANSIT, OUT_FOR_DELIVERY, COLLECTED, IN_WAREHOUSE
   - failed includes: FAILED, RETURNED
2. Add parcels.stats procedure to server/routers/parcels.ts:
   - protectedProcedure
   - input: { tenantId: z.string() }
   - calls getParcelStats
   - returns { success: true, data: stats }
3. Update client/src/pages/Home.tsx:
   - Replace trpc.parcels.list.useQuery (limit: 100) with trpc.parcels.stats.useQuery
   - Remove all manual filtering of parcels for stats
   - Show skeleton loading state while stats load

REQUIRED DELIVERABLES:
- Updated server/parcels.db.ts with getParcelStats
- Updated server/routers/parcels.ts with stats procedure
- Updated client/src/pages/Home.tsx using stats endpoint

ACCEPTANCE CRITERIA:
- parcels.stats returns correct counts matching actual DB values
- Home page renders without loading any individual parcel rows
- Stats are tenant-scoped
- TypeScript compiles (npm run check)
- Build succeeds (npm run build)
- Unit test for getParcelStats with fixture data

DO NOT:
- Return individual parcels in the stats endpoint
- Count soft-deleted parcels
- Include DELIVERED parcels in inTransit
```

---

### IMPL-PROMPT-08: Pagination

```
REPO: webwaka-logistics
TASK: Add Cursor-Based Pagination to Parcel List

CONTEXT:
You are working in the webwaka-logistics repository. The parcel list is hardcoded to limit 50 with no way to load older parcels. Add cursor-based pagination with a "Load More" button.

IMPORTANT REMINDERS:
- Mobile/PWA/Offline First: The cursor must be encoded (base64) so it doesn't expose internal IDs in the query string
- Multi-Tenant: pagination queries must still be scoped by tenantId
- Offline mode: when offline, show what's in IndexedDB — no pagination needed for offline (Dexie query returns all)

INSTRUCTIONS:
1. Update server/parcels.db.ts — listParcels function:
   - Accept cursor: { id: number; createdAt: Date } | null
   - If cursor present: WHERE (createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id < cursor.id))
   - Change default limit from 50 to 20
   - Return the list plus hasMore: boolean (check if count > limit)
2. Update server/routers/parcels.ts — list procedure:
   - Accept cursor: z.string().optional() (base64-encoded JSON)
   - Decode cursor, call listParcels with cursor
   - Return { success: true, data: { parcels, nextCursor: string | null } }
3. Update client/src/pages/ParcelsList.tsx:
   - Use TanStack Query's fetchNextPage / hasNextPage pattern
   - Accumulate results across pages
   - Show "Load More" button when hasNextPage = true
   - Button shows loading state while fetching
   - Button disappears when no more results
   - Keep search non-paginated (returns all matches up to 50)

REQUIRED DELIVERABLES:
- Updated server/parcels.db.ts
- Updated server/routers/parcels.ts
- Updated client/src/pages/ParcelsList.tsx

ACCEPTANCE CRITERIA:
- First load shows 20 parcels
- "Load More" fetches next 20
- No records skipped or duplicated across pages
- Works correctly when new parcels are added during browsing
- TypeScript compiles, build succeeds

DO NOT:
- Use OFFSET-based pagination (unstable)
- Expose raw database IDs in cursor (must be base64 encoded)
```

---

### IMPL-PROMPT-09: Agent Assignment Fix

```
REPO: webwaka-logistics
TASK: Fix Dispatch Page to Use Real Agent Selection Instead of Hardcoded agentId: 1

CONTEXT:
You are working in the webwaka-logistics repository. The Dispatch page currently hardcodes agentId: 1 in all dispatch assignments. The ClusterCard component already has a dropdown for agent selection but it's not wired to pass the selected agent to the mutation. Fix this.

IMPORTANT REMINDERS:
- Multi-Tenant: agent list must be scoped by tenantId
- The role column on users table can be 'user', 'agent', or 'admin' — show users with role 'agent' or 'admin'

INSTRUCTIONS:
1. Add dispatch.listAgents tRPC procedure in server/routers/dispatch.ts:
   - protectedProcedure
   - input: { tenantId: z.string() }
   - query users table for all users in this tenant (by matching on tenantId context or all users if global)
   - return: { id, name, email, role }[]
2. In client/src/pages/Dispatch.tsx:
   - Read dispatch.listAgents.useQuery for the tenant
   - Pass the agents array to ClusterCard
   - Ensure ClusterCard's selectedAgent state value is passed in the onAssign callback
   - Remove the hardcoded agentId: 1
   - The actual agentId should come from parseInt(selectedAgent, 10)

REQUIRED DELIVERABLES:
- Updated server/routers/dispatch.ts with listAgents procedure
- Updated client/src/pages/Dispatch.tsx

ACCEPTANCE CRITERIA:
- Agent dropdown shows real names from database
- Selected agent ID is passed in the assignment mutation (not 1)
- Assignment confirmed in DB with correct assignedAgentId value
- If no agents exist: show helpful empty state

DO NOT:
- Show users with role 'user' in the agent dropdown (only 'agent' and 'admin')
- Allow assignment without selecting an agent
```

---

### IMPL-PROMPT-10: Replace Math.random() with Crypto

```
REPO: webwaka-logistics
TASK: Replace Math.random() with Cryptographically Secure Random in Tracking Number and OTP Generation

CONTEXT:
You are working in the webwaka-logistics repository. Two functions use Math.random():
1. generateTrackingNumber() in server/parcels.db.ts
2. generateOtp() in server/otp.ts
Both must be replaced with crypto.getRandomValues() or crypto.randomBytes() for cryptographic security.

IMPORTANT REMINDERS:
- The tracking number format WW-{YYYYMMDD}-{6CHAR} must be preserved — only the {6CHAR} part changes
- OTP range must be 0000-9999 (padded with leading zeros) — NOT 1000-9999 as currently coded
- Cloudflare Workers uses Web Crypto API (globalThis.crypto) — not Node.js crypto module — use the universal approach

INSTRUCTIONS:
1. Update server/parcels.db.ts — generateTrackingNumber():
   - Replace Math.random().toString(36).substring(2,8).toUpperCase() 
   - Use: crypto.randomBytes(4).toString('hex').toUpperCase().slice(0,6)  (in Node)
   - Or for Workers compat: use Array.from(crypto.getRandomValues(new Uint8Array(3))).map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase().slice(0,6)
2. Update server/otp.ts — generateOtp():
   - Replace Math.floor(Math.random() * 9000) + 1000
   - Use: String(crypto.randomInt(0, 10000)).padStart(4, '0')  (Node 14.10+)
   - Or: String(new DataView(crypto.getRandomValues(new Uint32Array(1)).buffer).getUint32(0) % 10000).padStart(4, '0')
3. Update ALL unit tests for generateOtp to expect 4-digit strings including values like "0000", "0001", etc.

REQUIRED DELIVERABLES:
- Updated server/parcels.db.ts
- Updated server/otp.ts
- Updated unit tests

ACCEPTANCE CRITERIA:
- No Math.random() call in tracking number or OTP generation
- OTP range 0000-9999 (verified by statistical test)
- Tracking number still format WW-{YYYYMMDD}-{6UPPERALPHANUM}
- All unit tests pass (npm run test)

DO NOT:
- Change the tracking number format
- Change the OTP length (still 4 digits — upgrade to 6 is a separate task)
- Use console.log
```

---

## 9. QA PROMPTS

---

### QA-PROMPT-01: CI/CD Fix QA

```
REPO: webwaka-logistics
QA TASK: Verify CI/CD Workflow Migration from pnpm to npm

OBJECTIVE: Verify that all four GitHub Actions workflow files have been correctly migrated from pnpm to npm, and that the CI pipeline runs correctly.

ECOSYSTEM CAVEAT: The webwaka-logistics repo is part of a multi-repo platform. CI must correctly resolve the local @webwaka/core package.

WHAT TO VERIFY:
1. Search entire .github/workflows/ for any pnpm reference — expect zero results
2. Verify all four workflow files: test.yml, deploy-prod.yml, deploy-staging.yml, preview-pr.yml
3. Confirm `npm ci` is present (not npm install)
4. Confirm Node.js 20 is specified
5. Confirm cache uses `package-lock.json` as the key
6. Create a test branch and push it — observe GitHub Actions result
7. Check all jobs complete without pnpm-not-found errors

BUGS TO LOOK FOR:
- Partial migration: some files updated, others not
- npm install used instead of npm ci
- Wrong cache key file

EDGE CASES:
- Deployment workflow that runs on main branch only — may not be testable via PR

REGRESSION DETECTION:
- Run npm run test locally first, confirm same tests that ran before still run
- Confirm build artifact (dist/) is produced

DONE MEANS: All four workflow files pass linting (yamllint), and a test PR shows green checkmarks on all checks.
```

---

### QA-PROMPT-02: Manus Artifact Removal QA

```
REPO: webwaka-logistics
QA TASK: Verify Complete Removal of Manus Runtime localStorage Artifact

OBJECTIVE: Confirm that no reference to manus-runtime exists in the codebase and that user data is no longer written to localStorage.

WHAT TO VERIFY:
1. grep -r "manus-runtime" . --exclude-dir=node_modules → must return zero results
2. grep -r "manus" . --exclude-dir=node_modules → review any remaining (legitimate references?)
3. Open the app in a browser, log in, open DevTools → Application → Local Storage → confirm no manus-runtime-user-info key
4. Verify useAuth hook still returns { user, loading, error, isAuthenticated, refresh, logout }
5. Navigate all protected routes after login — confirm all render correctly

BUGS TO LOOK FOR:
- localStorage key still present after login
- useAuth hook breaks (returns wrong shape) after the removal

EDGE CASES:
- Users who were previously logged in — old manus-runtime-user-info may be in localStorage. Test clearing it manually and confirming the app still works.

DONE MEANS: No localStorage entry with manus-runtime key exists after login. All protected pages render correctly.
```

---

### QA-PROMPT-03: Status Transition Fix QA

```
REPO: webwaka-logistics
QA TASK: Verify IN_WAREHOUSE Status Transition Map Fix

OBJECTIVE: Confirm that parcels can move to and from IN_WAREHOUSE status correctly.

WHAT TO VERIFY:
1. npm run test — all tests pass
2. Manually: create parcel → receive at warehouse via /receiving → status changes to IN_WAREHOUSE
3. Manually: from parcel detail, update status to IN_TRANSIT → should succeed
4. Verify: attempting IN_WAREHOUSE → DELIVERED directly → should fail with validation error

TRANSITION MATRIX TO TEST (all should match expected):
- PENDING → IN_WAREHOUSE: should FAIL (parcels aren't received directly from PENDING)
- COLLECTED → IN_WAREHOUSE: should SUCCEED
- IN_WAREHOUSE → IN_TRANSIT: should SUCCEED
- IN_WAREHOUSE → FAILED: should SUCCEED
- IN_WAREHOUSE → DELIVERED: should FAIL

REGRESSIONS TO CHECK:
- All transitions that worked before still work
- DELIVERED → anything still fails (terminal state)
- RETURNED → anything still fails (terminal state)

DONE MEANS: Full transition matrix matches expected results. npm run test passes.
```

---

### QA-PROMPT-04: HMAC Webhook Verification QA

```
REPO: webwaka-logistics
QA TASK: Verify HMAC-SHA256 Webhook Signature Verification for All Three Providers

OBJECTIVE: Confirm that all three webhook endpoints (GIG, Kwik, Sendbox) correctly verify HMAC-SHA256 signatures and reject invalid or missing signatures.

WHAT TO VERIFY:
For each provider (GIG, Kwik, Sendbox):
1. Send a POST request with valid HMAC-SHA256 signature → expect 200 OK
2. Send a POST request with wrong signature → expect 401
3. Send a POST request with no signature header → expect 401
4. Send a POST request with empty body but valid HMAC → verify it doesn't crash

TIMING ATTACK CHECK:
- Verify crypto.timingSafeEqual is used in the verification code (code review)
- Verify no string === comparison for signatures

EDGE CASES:
- Provider secret not set in environment: dev mode → should warn and allow; prod mode → should reject
- Very large webhook body (test with 1MB payload) → should still work
- Webhook with unknown status code → still processes signature, returns 200 with note

REGRESSION DETECTION:
- Run npm run test — gigWebhook tests must all pass
- Verify existing delivery request tracking still works end-to-end

DEPLOYMENT CHECKS:
- Verify GIG_WEBHOOK_SECRET, KWIK_WEBHOOK_SECRET, SENDBOX_WEBHOOK_SECRET are in env for production

DONE MEANS: All three providers return 401 for unsigned requests. All pass with correctly signed requests. Tests pass.
```

---

### QA-PROMPT-05: Rate Limiting QA

```
REPO: webwaka-logistics
QA TASK: Verify Rate Limiting on Public and API Endpoints

OBJECTIVE: Confirm that rate limiting is correctly applied to appropriate endpoints and not applied to webhook or health check endpoints.

WHAT TO VERIFY:
1. Public tracking: Send 31 requests in 60 seconds → 31st returns 429 with Retry-After header
2. Auth endpoints: Send 11 requests in 60 seconds → 11th returns 429
3. Webhook endpoint: Send 100 requests rapidly → all succeed (not rate limited)
4. Health endpoint (if exists): Not rate limited

HEADERS TO VERIFY:
- X-RateLimit-Limit present
- X-RateLimit-Remaining decrements correctly
- Retry-After present on 429 responses
- Response body is JSON: { error: "Too many requests", retryAfter: N }

EDGE CASES:
- Behind Cloudflare: test with CF-Connecting-IP header spoofing to ensure server uses correct key
- Multiple IPs: verify limit is per-IP, not global
- Rate limit reset: wait for window to expire → limit resets

DONE MEANS: 31st request to public tracking returns 429; webhook endpoints accept unlimited requests; npm run test passes.
```

---

### QA-PROMPT-06: Digital Signature QA

```
REPO: webwaka-logistics
QA TASK: Verify Canvas Signature Pad for Proof of Delivery

OBJECTIVE: Confirm that the signature pad captures, encodes, and stores electronic signatures correctly as part of the POD flow.

WHAT TO VERIFY:
1. SignaturePad renders on desktop browser (Chrome, Firefox)
2. SignaturePad renders on mobile (Android Chrome — simulate via DevTools mobile emulation)
3. Touch events register correctly (draw strokes on mobile)
4. Clear button resets canvas to white
5. Attempting to submit POD without drawing → error message shown
6. Drawing and submitting → signature stored in R2 → signatureUrl in proof_of_delivery table
7. POD card on ParcelDetail shows signature preview

EDGE CASES:
- High-DPI display: canvas resolution is correct (no blurry signature)
- Very fast swipe (touchstart + touchend with no touchmove): should register as a point
- Landscape vs portrait: canvas resizes correctly

REGRESSION DETECTION:
- Photo capture (CameraPOD) still works
- submitPOD still works when signatureBase64 is provided
- Existing POD records (without signature) still display correctly

MOBILE TESTING:
- Test on a real Android device with touch screen (not just DevTools emulation)
- Confirm pen input registration on Samsung devices (common Nigerian rider device)

DONE MEANS: Complete POD flow works with photo + signature; both stored in R2; both visible on parcel detail.
```

---

### QA-PROMPT-07: Stats Endpoint QA

```
REPO: webwaka-logistics
QA TASK: Verify Dashboard Stats Use Dedicated Endpoint (Not Full Parcel Load)

OBJECTIVE: Confirm that the home page uses the parcels.stats endpoint and correctly displays counts matching actual database values.

WHAT TO VERIFY:
1. Open browser DevTools Network tab
2. Navigate to Home page
3. Confirm: parcels.stats request is made (not parcels.list with limit 100)
4. Confirm: no individual parcel rows are loaded for stats calculation
5. Verify stats match actual counts:
   - Create 3 PENDING parcels → total should be 3, pending should be 3
   - Change 1 to IN_TRANSIT → pending = 2, inTransit = 1
   - Change 1 to DELIVERED → delivered = 1
6. Verify stats are tenant-scoped (different tenant sees different numbers)
7. Verify skeleton loading state appears while stats load

PERFORMANCE CHECK:
- parcels.stats response time under 100ms (check in Network tab)
- Home page TTI (Time to Interactive) improved vs before

EDGE CASES:
- Tenant with zero parcels → all stats show 0 (not undefined/NaN)
- Tenant with 10,000 parcels → stats still fast

DONE MEANS: Home page makes parcels.stats request; displays correct counts; no individual parcel rows loaded for stats; response under 100ms.
```

---

### QA-PROMPT-08: Pagination QA

```
REPO: webwaka-logistics
QA TASK: Verify Cursor-Based Pagination on Parcel List

OBJECTIVE: Confirm that the parcel list correctly loads 20 results at a time, provides a working "Load More" button, and cursor pagination doesn't skip or duplicate records.

WHAT TO VERIFY:
1. Create 25 parcels for a tenant
2. Navigate to /parcels
3. Confirm: 20 parcels shown initially
4. Confirm: "Load More" button visible
5. Click "Load More" → 5 more parcels load (total 25 visible)
6. "Load More" disappears or is disabled (no more results)
7. Create a new parcel while on page 2 → verify no duplication or skipping when loading more

STABILITY TEST:
- Load page 1 (records 1-20)
- Create a new parcel (it becomes record 0 by createdAt)
- Load more → records 21-25 appear without duplicating records 1-20

EDGE CASES:
- Tenant with exactly 20 parcels → "Load More" appears, click it → 0 more results → button disappears
- Tenant with 0 parcels → empty state shown, no "Load More" button

OFFLINE BEHAVIOR:
- Go offline → confirm parcel list shows IndexedDB records (pagination not applied to offline data)

DONE MEANS: First load shows 20; "Load More" works; no records duplicated or skipped; offline mode unaffected.
```

---

### QA-PROMPT-09: Agent Assignment QA

```
REPO: webwaka-logistics
QA TASK: Verify Real Agent Assignment in Dispatch Page

OBJECTIVE: Confirm that the agent dropdown on the Dispatch page shows real agents from the database, and that selecting an agent correctly assigns parcels to that agent (not to agentId: 1).

WHAT TO VERIFY:
1. Create 2 test users with role 'agent'
2. Navigate to /dispatch
3. Create a cluster with pending parcels
4. Open agent dropdown → should show agent 1 and agent 2 by name
5. Select agent 2 → click Assign
6. Query DB: parcels should have assignedAgentId = agent2.id (NOT 1)
7. Verify agent name shown on cluster card after assignment

EDGE CASES:
- No agents in the system → helpful empty state: "No agents available — add users with Agent role first"
- Assigning to a different agent → reassignment updates DB record

REGRESSION DETECTION:
- Dispatch bulk assignment still works (multiple parcel IDs in one call)
- Cluster rendering and grouping still correct

DONE MEANS: Agent dropdown shows real names; selected agent's actual ID stored in DB; no hardcoded agentId: 1.
```

---

### QA-PROMPT-10: Crypto Random QA

```
REPO: webwaka-logistics
QA TASK: Verify Cryptographic Random Replacement in Tracking Number and OTP Generation

OBJECTIVE: Confirm that Math.random() has been replaced with cryptographically secure random for both tracking number and OTP generation.

WHAT TO VERIFY:
1. grep -r "Math.random" server/ → must return zero results in tracking and OTP files
2. Run npm run test → all OTP tests pass
3. Statistical test — run generateOtp() 10,000 times:
   - Count results < 1000 → should be approximately 1,000 (~10%)
   - Count results > 9000 → should be approximately 1,000 (~10%)
   - Confirm range is 0000-9999 (not 1000-9999)
4. Verify tracking numbers are still in format WW-YYYYMMDD-XXXXXX (6 uppercase alphanum)
5. Generate 100 tracking numbers — confirm no collisions

OTP RANGE TEST (critical):
```bash
# In Node.js REPL or test:
const counts = {};
for (let i = 0; i < 10000; i++) {
  const otp = generateOtp();
  const n = parseInt(otp, 10);
  counts[n < 1000 ? 'low' : n > 9000 ? 'high' : 'mid']++;
}
// low count should be ~1000, not 0
```

DONE MEANS: No Math.random() calls in either file; OTP range confirmed 0000-9999; all tests pass.
```

---

## 10. PRIORITY ORDER

### CRITICAL (Do First — Blocking All Other Work or Security Risk)
| Priority | Task | Reason |
|----------|------|--------|
| 1 | TASK-01: Fix CI/CD (npm) | All automation is broken |
| 2 | TASK-02: Remove Manus Artifact | NDPR violation — data leak |
| 3 | TASK-04: HMAC Webhook Signatures | Critical security vulnerability |
| 4 | TASK-03: Status Transition IN_WAREHOUSE | Core operational bug |
| 5 | TASK-09: Fix Agent Assignment | Dispatch is non-functional |

### HIGH (Do Second — Operational Correctness)
| Priority | Task | Reason |
|----------|------|--------|
| 6 | TASK-07: Stats Endpoint | Performance and bandwidth |
| 7 | TASK-05: Rate Limiting | DoS protection |
| 8 | TASK-08: Pagination | Core UX — can't see all parcels |
| 9 | TASK-12: Crypto Random | Security baseline |
| 10 | TASK-11: CSRF Protection | Security baseline |

### MEDIUM (Do Third — Feature Completeness)
| Priority | Task | Reason |
|----------|------|--------|
| 11 | TASK-06: Digital Signature | Completes POD flow |
| 12 | TASK-14: OTP Hardening | Security improvement |
| 13 | TASK-13: Audit Logging | Compliance requirement |
| 14 | TASK-10: Event Bus Wiring | Platform architecture |
| 15 | TASK-18: Service Worker Versioning | Reliability |

### LOWER (Do Fourth — Enhancement)
| Priority | Task | Reason |
|----------|------|--------|
| 16 | TASK-15: COD Tracking | Revenue protection |
| 17 | TASK-17: SMS Notifications | CX improvement |
| 18 | TASK-16: License Expiry Monitoring | Compliance |
| 19 | TASK-19: i18n Completion | Nigeria-First |
| 20 | TASK-20: NDPR Compliance Module | Legal |

---

## 11. DEPENDENCIES MAP

```
TASK-01 (CI fix)
└── Should be done before any task that requires CI verification

TASK-02 (Manus artifact) — standalone
TASK-03 (IN_WAREHOUSE transition) — standalone
TASK-04 (HMAC webhooks) — standalone
TASK-05 (Rate limiting) — standalone
TASK-06 (Digital signature) — standalone
TASK-07 (Stats endpoint) — standalone
TASK-08 (Pagination) — standalone
TASK-09 (Agent assignment) — standalone
TASK-12 (Crypto random) — standalone
   └── TASK-14 (OTP hardening) depends on TASK-12

TASK-10 (Event bus wiring)
   └── TASK-17 (SMS notifications) depends on TASK-10

TASK-13 (Audit logging)
   └── TASK-20 (NDPR module) depends on TASK-13

TASK-14 (OTP hardening)
   ├── Depends on: TASK-12 (crypto random)
   └── Recommends: TASK-05 (rate limiting)

TASK-15 (COD tracking) — standalone (schema change)
TASK-16 (License expiry) — standalone
TASK-18 (Service worker) — standalone
TASK-19 (i18n completion) — standalone
```

---

## 12. PHASE SPLIT

### Phase 1 — Critical Security and Operational Fixes
Execute immediately. These are bugs, not enhancements.

- TASK-01: CI/CD fix
- TASK-02: Remove Manus artifact
- TASK-03: Status transition fix
- TASK-04: HMAC webhook verification
- TASK-05: Rate limiting
- TASK-07: Stats endpoint
- TASK-08: Pagination
- TASK-09: Agent assignment fix
- TASK-12: Crypto random

### Phase 2 — Feature Completion and Platform Architecture
Execute after Phase 1 is QA-verified.

- TASK-06: Digital signature (POD completion)
- TASK-10: Event bus wiring (platform architecture)
- TASK-11: CSRF protection
- TASK-13: Audit logging
- TASK-14: OTP hardening
- TASK-15: COD tracking
- TASK-16: License expiry monitoring
- TASK-17: SMS notifications
- TASK-18: Service worker versioning
- TASK-19: i18n completion
- TASK-20: NDPR compliance module

---

## 13. ECOSYSTEM NOTES

### What This Repo Does vs. What Lives Elsewhere

| Capability | Lives In | Notes |
|-----------|----------|-------|
| User authentication (OAuth) | External OAuth server | `OAUTH_SERVER_URL` must be configured |
| Identity verification (KYC) | Fintech repo | Emits `kyc.verification_completed` webhooks |
| Trip/waybill management | Transport repo | `TRANSPORT_BASE_URL` must be configured |
| Order placement | Commerce repo | Emits `order.ready_for_delivery` events |
| Payment processing | Payment repo (Paystack) | Only data model here; integration elsewhere |
| Shared event contracts | `@webwaka/core` npm package | Import from `@webwaka/core` always |
| SMS provider abstraction | `@webwaka/core` npm package | Use `sendTermiiSms` from core |

### Cross-Repo Event Contracts
Events this repo EMITS:
- `parcel.created`, `parcel.collected`, `parcel.dispatched`, `parcel.status_updated`, `parcel.out_for_delivery`, `parcel.delivered`, `parcel.failed`, `parcel.returned`, `parcel.trip_assigned`
- `kyc.verification_requested` (to Fintech repo)
- `parcel.seats_required` (to Transport repo)

Events this repo RECEIVES:
- `order.ready_for_delivery` (from Commerce repo) → `/api/events/commerce`
- `kyc.verification_completed` (from Fintech repo) → `/api/events/kyc`
- `transport.*` events (from Transport repo) → `/internal`
- Provider webhooks: GIG, Kwik, Sendbox → `/api/webhooks/{provider}`

### @webwaka/core Package
All shared utilities, event contracts, and provider integrations live in `@webwaka/core`. Before adding any new shared utility to this repo, check if it belongs in `@webwaka/core` first. The principle is **Build Once Use Infinitely**.

---

## 14. GOVERNANCE AND REMINDERS

### Core Principles (Apply to Every Task)

| Principle | Application |
|-----------|-------------|
| Build Once Use Infinitely | New utilities → check if they belong in `@webwaka/core` |
| Mobile/PWA/Offline First | Every UI change must be tested on mobile. Every write must go through mutation queue when offline. |
| Nigeria-First, Africa-Ready | NGN/kobo, WAT timezone, Termii SMS, Nigerian address patterns |
| Vendor Neutral AI | LLM calls → OpenRouter via server/_core/llm.ts |
| Multi-Tenant Tenant-as-Code | `tenantId` on every query. Never query without tenant scope. |
| Event-Driven | No direct cross-DB access. Publish events. Never call another repo's DB directly. |
| Thoroughness Over Speed | No shortcuts. Complete the entire task before marking done. |
| Zero Skipping Policy | Never skip a test, a migration, or a cross-module check. |
| Multi-Repo Platform Architecture | This repo is one component. Not every capability lives here. |
| Governance-Driven Execution | Read repo docs and governance docs before acting. |
| CI/CD Native Development | Every change must pass CI before merging. |
| Cloudflare-First Deployment | D1 for DB, R2 for storage, KV for events/sessions, Workers for compute. |

### Invariants (Never Violate)

1. **All monetary values stored as integers in kobo** — never floats, never naira strings in DB
2. **All timestamps stored as INTEGER (Unix epoch)** in SQLite/D1 — never ISO strings in DB
3. **Multi-tenant isolation** — `tenantId` in every SELECT, INSERT, UPDATE, DELETE
4. **Soft deletes** — `deletedAt IS NULL` on all active record queries
5. **No `console.log`** — use `createLogger` from `server/logger.ts`
6. **No direct DB access from frontend** — all queries via tRPC procedures
7. **NDPR** — no raw license numbers, BVN, NIN stored in DB — only R2 keys
8. **Platform response format** — all tRPC procedures return `{ success: true, data: ... }` or throw `TRPCError`

---

## 15. EXECUTION READINESS NOTES

### Before Starting Any Task

1. Read `replit.md` for current project state
2. Read `todo.md` for implemented features and known limitations
3. Read `LOG-2-QA-REPORT.md` for QA history
4. Run `npm run check` — confirm TypeScript compiles
5. Run `npm run test` — confirm all tests pass
6. Review the specific files mentioned in the task's "Likely files to change" list

### Environment Variables Needed

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `PORT` | Server port (5000) | Development |
| `JWT_SECRET` | Cookie signing | Authentication |
| `OAUTH_SERVER_URL` | External auth | Authentication |
| `DATABASE_PATH` | SQLite file path | Development |
| `INTER_SERVICE_SECRET` | Transport integration | P12 |
| `TRANSPORT_BASE_URL` | Transport repo URL | P12 |
| `TERMII_API_KEY` | OTP SMS | L-06, TASK-17 |
| `OTP_OFFLINE_SECRET` | Offline HMAC | L-06 |
| `GIG_WEBHOOK_SECRET` | GIG HMAC | TASK-04 |
| `KWIK_WEBHOOK_SECRET` | Kwik HMAC | TASK-04 |
| `SENDBOX_WEBHOOK_SECRET` | Sendbox HMAC | TASK-04 |
| `AWS_ACCESS_KEY_ID` | R2 access | Storage |
| `AWS_SECRET_ACCESS_KEY` | R2 secret | Storage |
| `AWS_REGION` | R2 region | Storage |
| `AWS_ENDPOINT_URL` | R2 endpoint | Storage |
| `AWS_BUCKET` | R2 bucket name | Storage |

### Current Technical Debt Summary

| Debt Item | Impact | Task |
|-----------|--------|------|
| Event bus is log-only | No downstream event processing | TASK-10 |
| useTenantId returns openId | Not a real tenant ID | Future (CORE-3) |
| drizzle.config.ts uses d1-http | Can't run drizzle-kit locally | Configuration bug |
| Two migration directories | Confusion about canonical migrations | Needs cleanup |
| Service worker hardcoded version | Stale cache never invalidates | TASK-18 |
| No integration tests for tRPC | Confidence gap in API contracts | Future |

### Definition of Done for Each Task

A task is **done** when:
1. ✅ All code changes are in place
2. ✅ TypeScript compiles: `npm run check` passes
3. ✅ All tests pass: `npm run test` — no new failures
4. ✅ Build succeeds: `npm run build`
5. ✅ The specific acceptance criteria in the task are met
6. ✅ No regression in related functionality
7. ✅ QA plan executed and documented

---

*Document generated: 2026-04-04*
*Repo: webwaka-logistics*
*Platform: WebWaka Multi-Repo Ecosystem*
*Classification: Internal Engineering Reference*
