# WebWaka Logistics Suite

A modern, offline-first logistics management platform for Nigeria and Africa. It manages parcel tracking, delivery orchestration, and field operations with a "Mobile-First, PWA-First, Africa-First" philosophy.

## Tech Stack

- **Frontend:** React 19 + TypeScript, Vite 7, Tailwind CSS 4, Radix UI
- **Routing:** Wouter
- **State / Data:** TanStack Query v5 + tRPC v11
- **Offline Storage:** Dexie.js (IndexedDB)
- **PWA:** Service Workers + Background Sync
- **Backend (dev):** Express + tRPC + better-sqlite3 (SQLite) running on port 5000
- **Backend (production target):** Hono on Cloudflare Workers + D1 + KV + R2
- **Package Manager:** pnpm

## Project Structure

```
client/         React frontend
  src/
    _core/      Auth hooks and core logic
    components/ Reusable UI components (Radix-based)
    contexts/   Theme, I18n providers
    lib/        Sync engine, offline DB, tRPC client
    pages/      App views (Home, ParcelsList, CreateParcel, etc.)
server/         Express backend (development)
  index.ts      Entry point — delegates to _core/index.ts
  _core/        Express server, tRPC context, OAuth, env config
  routers/      tRPC router definitions (parcels, system, auth)
  db.ts         SQLite database (better-sqlite3 + drizzle-orm)
  parcels.db.ts Parcel CRUD query helpers
  eventBus.ts   Event publishing (CORE-2 integration point)
  storage.ts    File upload/download via storage proxy
shared/         Shared TypeScript types and constants
drizzle/        Drizzle ORM schema (SQLite) + old MySQL migrations
patches/        Local pnpm patches (wouter)
```

## Running Locally

The "Start application" workflow runs the Express+Vite dev server on port 5000:

```bash
PORT=5000 NODE_ENV=development pnpm dev
# expands to: tsx server/index.ts
```

The Express server serves both the tRPC API and the Vite frontend in development mode.

## Environment Variables

### Frontend (prefixed with VITE_)
- `VITE_OAUTH_PORTAL_URL` — OAuth portal URL for authentication
- `VITE_APP_ID` — App ID for OAuth flow

### Backend
- `OAUTH_SERVER_URL` — OAuth server base URL
- `JWT_SECRET` — Secret for signing session JWTs
- `DATABASE_PATH` — Path to SQLite database file (default: `local.db`)
- `OWNER_OPEN_ID` — OpenID of the app owner (gets admin role)
- `BUILT_IN_FORGE_API_URL` — Storage proxy base URL
- `BUILT_IN_FORGE_API_KEY` — Storage proxy API key
- `PORT` — Server port (default: 3000, workflow uses 5000)

If OAuth env vars are not set, the app shows the login screen but OAuth callback will fail.

## Database

Uses better-sqlite3 (local SQLite) in development. Tables are auto-created on first run via `runMigrations()` in `server/db.ts`. The database file defaults to `local.db` in the project root.

## Deployment

Build the frontend:
```bash
pnpm build
```

The Cloudflare Workers backend (production) is deployed separately via Wrangler and requires D1/KV/R2 setup.

## P04 — Commerce ↔ Logistics Event Contracts

### New package: `packages/core`
- `@webwaka/core` (v1.2.0) — single source of truth for event type strings (`CommerceEvents`) and all shared payload types.
- All event type strings in server code must reference `CommerceEvents` from this package only.

### New database table: `delivery_requests`
- Created automatically on server start via `runMigrations()` in `server/db.ts`.
- Stores one record per incoming `order.ready_for_delivery` event. Unique on `orderId` for idempotency.

### New server modules
| File | Purpose |
|---|---|
| `server/delivery.db.ts` | DB query helpers for delivery_requests |
| `server/events/commerceEventBus.ts` | Publishes events to COMMERCE_EVENTS queue |
| `server/events/orderReadyForDelivery.ts` | Handles `order.ready_for_delivery` (TASK 2) |
| `server/events/commerceEventRouter.ts` | Express router: `POST /api/events/commerce` |
| `server/providers/index.ts` | Provider registry: GIG, Kwik, Sendbox, Errand Boy |
| `server/webhooks/providers/gig.ts` | GIG Logistics webhook handler |
| `server/webhooks/providers/kwik.ts` | Kwik Delivery webhook handler |
| `server/webhooks/providers/sendbox.ts` | Sendbox webhook handler |
| `server/webhooks/webhookRouter.ts` | Express router: `POST /api/webhooks/{gig,kwik,sendbox}` |
| `server/routers/logistics.ts` | tRPC lifecycle API (TASK 5) |

### New API endpoints
- `POST /api/events/commerce` — receives inbound commerce events
- `POST /api/webhooks/gig` — GIG Logistics status webhooks
- `POST /api/webhooks/kwik` — Kwik Delivery status webhooks
- `POST /api/webhooks/sendbox` — Sendbox status webhooks
- `trpc.logistics.getRequest` — get delivery request by orderId
- `trpc.logistics.assignProvider` — assign a specific provider
- `trpc.logistics.cancelRequest` — cancel + publish FAILED event

### New env vars (optional)
- `COMMERCE_EVENTS_URL` — URL to HTTP-forward outbound events to the commerce system
- `GIG_WEBHOOK_SECRET` — webhook secret for GIG Logistics signature validation
- `KWIK_WEBHOOK_SECRET` — webhook secret for Kwik Delivery
- `SENDBOX_WEBHOOK_SECRET` — webhook secret for Sendbox

## Key Features

- Multi-tenant parcel tracking system
- Commerce ↔ Logistics event contracts (P04)
- Delivery provider registry with fee estimation (GIG, Kwik, Sendbox, Errand Boy)
- Provider webhook handlers with canonical status mapping
- Offline-first mutation queue (syncs when back online)
- PWA with service worker and background sync
- JWT-based authentication with tenant ID support
- Nigerian logistics context (Nigeria-first UX)
- Public parcel tracking (no auth required)
- Proof of delivery with photo/signature upload
