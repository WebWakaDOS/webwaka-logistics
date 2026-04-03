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

## Migration Notes (Replit)

- Removed `@builder.io/vite-plugin-jsx-loc` (incompatible with Vite 7) and `vite-plugin-manus-runtime` (Manus-specific)
- Removed `pnpm` workspace configuration — project now uses standard `npm`
- Workflow configured to run `PORT=5000 npm run dev` with webview on port 5000
