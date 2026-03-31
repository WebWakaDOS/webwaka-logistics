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

## Key Features

- Multi-tenant parcel tracking system
- Offline-first mutation queue (syncs when back online)
- PWA with service worker and background sync
- JWT-based authentication with tenant ID support
- Nigerian logistics context (Nigeria-first UX)
- Public parcel tracking (no auth required)
- Proof of delivery with photo/signature upload
