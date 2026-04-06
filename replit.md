# WebWaka Logistics

A multi-tenant logistics management platform for Nigeria & Africa's parcel tracking and delivery management.

## Architecture

- **Frontend**: React 19 + TypeScript, Vite, TanStack Query, tRPC, Radix UI / Shadcn, Tailwind CSS 4
- **Backend**: Express.js server with tRPC API, SQLite via better-sqlite3 + Drizzle ORM
- **Auth**: JWT-based via `jose`, OAuth flow
- **Routing**: `wouter` (client-side)
- **State**: TanStack Query + tRPC for data fetching

## Project Structure

```
client/          React frontend (Vite root)
server/          Express backend
  _core/         Core infrastructure (auth, vite middleware, trpc setup)
  routers/       tRPC routers (parcels, logistics)
  webhooks/      Provider webhook handlers
  events/        Commerce event bus
shared/          Shared types and constants
packages/core/   @webwaka/core - shared event contracts
drizzle/         Database schema and migrations
```

## Running the App

- **Development**: `PORT=5000 npm run dev` (runs Express + Vite middleware on port 5000)
- The server auto-runs SQLite migrations on startup (no separate migration step needed for dev)

## Key Environment Variables

- `PORT` — server port (set to 5000 for Replit)
- `JWT_SECRET` — cookie signing secret
- `OAUTH_SERVER_URL` — OAuth provider base URL
- `DATABASE_PATH` — SQLite file path (defaults to `local.db`)
- `INTER_SERVICE_SECRET` — shared secret for inter-service auth (transport ↔ logistics)
- `TRANSPORT_BASE_URL` — base URL of the webwaka-transport service
- `TERMII_API_KEY` — Termii SMS provider API key (L-06: required for OTP delivery)
- `OTP_OFFLINE_SECRET` — HMAC secret for offline OTP tokens (L-06, defaults to built-in fallback)

## Offline Database (Dexie IndexedDB)

| Version | Tables Added |
|---------|-------------|
| v1 | `parcels`, `mutationQueue` |
| v2 | `otpCache` |
| v3 | `podPhotos` (T-LOG-02) |

## Implemented Features

### T-LOG-02: Tamper-Evident Photo Capture for POD

- **Live camera only** — gallery uploads are blocked. Primary path: `getUserMedia()` opens the rear camera in-browser with no file picker. Fallback: `<input type="file" capture="environment">` (mobile OS enforces camera).
- **Canvas watermarking** — every captured frame has a semi-transparent bar burned in with: WAT timestamp, GPS coordinates (lat/lng/accuracy), and parcel tracking number. No external library — HTML5 Canvas 2D only.
- **Geo-tagged** — `captureGeoLocation()` uses the browser Geolocation API with 8s timeout. GPS is best-effort; photo is still accepted if denied (watermark shows "GPS unavailable").
- **Offline-first** — captured blobs are saved to Dexie v3 `podPhotos` table immediately. When connectivity returns, the `podPhotoSyncWorker` drains the queue, converts blobs to base64, and uploads via `parcels.uploadPodPhoto` tRPC procedure → R2 storage.
- **`CameraPOD` component** (`client/src/components/CameraPOD.tsx`) — states: streaming → capturing → preview → confirmed or fallback. Viewfinder guide overlay, GPS status chip, retake flow.
- **Server endpoint** — `parcels.uploadPodPhoto` tRPC procedure uploads JPEG to R2 via `storagePut`, and if a POD record already exists without an image, it back-fills the `imageUrl`.
- **27 unit tests** in `server/__tests__/photoPod.test.ts` covering: timestamp formatting, GPS watermark formatting, image key generation, sync worker lifecycle, edge cases.
- **Key files**: `client/src/lib/photoPod.ts`, `client/src/lib/podPhotoSyncWorker.ts`, `client/src/components/CameraPOD.tsx`

### T-LOG-04: Offline-First Warehouse Receiving Scanner

- **`IN_WAREHOUSE` status** added to `PARCEL_STATUS` enum and drizzle schema.
- **Dexie v4** — `pendingInboundScans` table with compound index `[tenantId+trackingNumber]`; helpers: `saveInboundScan`, `getPendingInboundScans`, `getRecentInboundScans`, `markInboundScanSynced`, `countPendingInboundScans`, `hasPendingInboundScan`, `pruneOldInboundScans`.
- **`inboundScanSync.ts`** — background sync worker. Groups pending scans by tenant, de-duplicates tracking numbers within a batch, calls `warehouse.bulkReceiveScans` once per tenant per flush cycle, marks each scan with its server result (`received`/`already_received`/`not_found`). Triggers on `online` event and at app startup.
- **`ReceivingScanner.tsx`** — PWA barcode scanner page at `/receiving`. Uses `html5-qrcode` with `Html5Qrcode` API (rear camera, 12fps, QR+CODE128+CODE39+EAN13+ITF+DataMatrix). 3-second debounce per tracking number. Web Audio API success/error beep. Green flash overlay on scan. Manual entry fallback. Session log with sync status badges. Online/offline indicator.
- **`server/routers/warehouse.ts`** — `bulkReceiveScans` (idempotent, tenant-scoped, classifies each tracking number as `received`/`already_received`/`not_found`) and `receivedToday` tRPC endpoints.
- **`StatusBadge.tsx`** updated with cyan colour for `IN_WAREHOUSE` status.
- **Route** `/receiving` added to App.tsx Router. `initInboundScanSync` called in `SyncEngineInit` with cleanup.
- **Sidebar** — `Receiving` nav item added to `DashboardLayout.tsx` menu.
- **20 unit tests** in `server/__tests__/inboundScan.test.ts` covering: `groupScansByTenant`, `resolveResultPerScan`, deduplication logic, mock client contract.
- **Key files**: `client/src/lib/offlineDb.ts`, `client/src/lib/inboundScanSync.ts`, `client/src/pages/ReceivingScanner.tsx`, `server/routers/warehouse.ts`

### L-06: Secure OTP Verification for Proof of Delivery
- When a rider marks a parcel `OUT_FOR_DELIVERY`, a 4-digit OTP is auto-generated, SHA-256 hashed (stored in DB), and sent to the recipient's phone via the `@webwaka/core` Termii provider
- The rider's PWA receives a pre-computed 12-char HMAC offline token, cached in Dexie IndexedDB
- Before a POD can be submitted or status set to `DELIVERED`, the OTP must be verified
- **Online path**: `verifyOtp` tRPC procedure validates the entered code against the stored hash
- **Offline path**: client-side WebCrypto HMAC verification using the cached Dexie token — no server needed
- Verified OTPs are recorded with `otpVerifiedAt` timestamp in the `parcels` table
- 30 unit tests covering: generation, hashing, offline tokens, expiry, replay prevention, Termii dispatch failure modes

### Phase 1: Offline-First Driver App + POD Vault

**Driver App** (`/driver`) — `client/src/pages/DriverApp.tsx`
- Riders see all their assigned parcels grouped by status (PENDING → COLLECTED → IN_TRANSIT → OUT_FOR_DELIVERY)
- Per-parcel actions: "Mark Out for Delivery" (queued offline via Dexie), OTP verification (online or offline HMAC token), then "Capture Proof of Delivery" using `CameraPOD`
- GPS watchPosition reports rider coordinates to `fleet.reportLocation` every cycle; geofencing SMS sends automatically when rider enters 1 km of a recipient
- Online/offline status indicator; mutation queue via `enqueueMutation` in `offlineDb.ts`

**POD Vault** (`/pod-vault`) — `client/src/pages/PodVault.tsx`
- Grid view of all proof-of-delivery records for the tenant with photo thumbnails
- Click-to-expand lightbox shows full delivery photo, signature, recipient info, and submission timestamp
- Pagination (24 per page) via `parcels.listPODs` tRPC query

**New tRPC procedures**:
- `parcels.myDeliveries` — agent-scoped, returns all parcels assigned to the authenticated rider
- `parcels.listPODs` — returns paginated POD records with parcel join data

### Phase 2: AI Route Optimization + Automated Dispatch Engine

**AI Optimize button** on Dispatch page — calls `dispatch.optimizeRoute`
- Sends all unassigned parcel addresses to Gemini LLM (via `invokeLLM`) with a Lagos traffic-aware system prompt
- LLM responds with a JSON array of parcel IDs in optimal delivery order
- Falls back to original order silently if AI unavailable

**Auto Dispatch button** on Dispatch page — calls `dispatch.autoDispatch`
- Clusters all PENDING unassigned parcels using `clusterParcels` algorithm
- Round-robin assigns each cluster to available agents
- Shows a dismissible result banner listing cluster → agent assignments

### Phase 3: Real-Time Geofencing + Fleet Telemetry Dashboard

**Fleet Telemetry** (`/fleet`) — `client/src/pages/FleetTelemetry.tsx`
- Table + map toggle showing all active riders with GPS coords, speed, and last-seen time
- Auto-refreshes every 30 seconds via `fleet.getActiveRiders`
- Links to Google Maps for each rider's live position

**Server infrastructure**:
- `rider_locations` SQLite table in `drizzle/schema.ts`
- `server/fleet.db.ts` — `haversineMetres`, `upsertRiderLocation`, `getActiveRiderLocations`, `checkGeofenceHits`
- `server/routers/fleet.ts` — `reportLocation` (agentProcedure), `getActiveRiders` (protectedProcedure)
- Geofencing: when a rider reports GPS within 1 km of an OUT_FOR_DELIVERY parcel, Termii SMS fires to the customer

## Phase 1 Security & Enhancement Fixes

### TASK-01: CI/CD Workflows — npm migration
All 4 GitHub Actions workflows (test.yml, preview-pr.yml, deploy-prod.yml, deploy-staging.yml) converted from pnpm to npm. Removed `pnpm/action-setup` step and replaced `pnpm install --frozen-lockfile` with `npm ci`. All `pnpm run *` replaced with `npm run *`.

### TASK-02: Remove Manus Runtime Artifact
Removed `localStorage.setItem("manus-runtime-user-info", ...)` from `client/src/_core/hooks/useAuth.ts` — leaked authenticated user data to Manus runtime inspection tools.

### TASK-03: IN_WAREHOUSE Status Transition Fix
Added `IN_WAREHOUSE: ["IN_TRANSIT", "FAILED"]` to `VALID_TRANSITIONS` in `server/parcels.utils.ts` and added `IN_WAREHOUSE` as a valid exit from `COLLECTED`. Fixes warehouse receiving scanner (T-LOG-04) which was generating invalid transition errors.

### TASK-04: HMAC Webhook Signature Verification
All three webhook providers now verify HMAC-SHA256 signatures using `crypto.timingSafeEqual` (timing-safe comparison). Raw request body is captured before JSON parsing in `server/_core/index.ts` and stored as `req.rawBody`. Providers:
- GIG: `x-gig-signature` header
- Kwik: `x-kwik-token` header
- Sendbox: `x-sendbox-webhook-secret` header

### TASK-05: Rate Limiting
Added `express-rate-limit` package. `server/_core/rateLimit.ts` defines four limiters:
- Public tracking: 30 req/min
- Auth (OAuth): 10 req/min
- tRPC: 100 req/min
- General API: 200 req/min
Real IP resolved via `CF-Connecting-IP` → `X-Forwarded-For` → `req.ip` chain.

### TASK-07: Dedicated Stats Endpoint
Added `getParcelStats(tenantId)` to `server/parcels.db.ts` — single `GROUP BY status` query replacing the previous `limit:100` list-then-count pattern. New `parcels.stats` tRPC procedure. `Home.tsx` updated to use the stats endpoint.

### TASK-08: Cursor-Based Pagination
Added `listParcelsCursor(tenantId, limit, cursor?)` to `server/parcels.db.ts` — keyset/cursor pagination using `id < cursor` instead of `OFFSET`. New `parcels.listCursor` tRPC procedure. `ParcelsList.tsx` updated with "Load More" button using accumulated state.

### TASK-09: Fix Dispatch Agent Assignment
Verified already fixed: `Dispatch.tsx` uses `trpc.dispatch.getAgents.useQuery()` and passes selected `agentId` to `assignCluster`. No hardcoded values remain.

### TASK-11: CSRF Protection
- Changed `sameSite: "none"` → `sameSite: "strict"` in `server/_core/cookies.ts`
- Added origin validation middleware in `server/_core/index.ts` for all non-GET/non-webhook/non-OAuth routes. Rejects cross-origin mutating requests (403) unless origin matches host or `ALLOWED_ORIGINS` env var.

### TASK-12: Replace Math.random() with Crypto
- `generateTrackingNumber()` in `server/parcels.db.ts` now uses `crypto.randomBytes(4).toString("hex")` — no more `Math.random()`
- `generateOtp()` in `server/otp.ts` range fixed from `randomInt(1000, 10000)` → `randomInt(0, 10000).padStart(4, "0")` — enables leading-zero OTPs (0000–0999)

## Migration Notes (Replit)

- Removed `@builder.io/vite-plugin-jsx-loc` (incompatible with Vite 7) and `vite-plugin-manus-runtime` (Manus-specific)
- Removed `pnpm` workspace configuration — project now uses standard `npm`
- Workflow configured to run `PORT=5000 npm run dev` with webview on port 5000
