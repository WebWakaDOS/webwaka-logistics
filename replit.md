# WebWaka Logistics Suite

A modern, offline-first logistics management platform for Nigeria and Africa. It manages parcel tracking, delivery orchestration, and field operations with a "Mobile-First, PWA-First, Africa-First" philosophy.

## Tech Stack

- **Frontend:** React 19 + TypeScript, Vite 7, Tailwind CSS 4, Radix UI
- **Routing:** Wouter
- **State / Data:** TanStack Query v5 + tRPC v11
- **Offline Storage:** Dexie.js (IndexedDB)
- **PWA:** Service Workers + Background Sync
- **Backend (production):** Hono on Cloudflare Workers + D1 (SQLite) + KV + R2
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
server/         Cloudflare Worker backend (Hono)
  routers/      tRPC router definitions
  _core/        Context, env, system router
shared/         Shared TypeScript types and constants
drizzle/        Drizzle ORM schema and SQL migrations
patches/        Local pnpm patches (wouter)
```

## Running Locally

The "Start application" workflow runs the Vite dev server on port 5000:

```bash
pnpm vite --port 5000 --host 0.0.0.0
```

The backend is a Cloudflare Worker (not available locally without Wrangler + D1 setup). API calls will fail in development unless `wrangler dev` is also running.

## Environment Variables

- `VITE_OAUTH_PORTAL_URL` — OAuth portal URL for authentication
- `VITE_APP_ID` — App ID for OAuth flow

If these are not set, the app falls back to `/login` for the sign-in URL.

## Deployment

This is a static SPA that deploys to Replit's static hosting. The build output goes to `dist/public`.

```bash
pnpm build
```

The backend (Cloudflare Workers) is deployed separately via Wrangler:

```bash
pnpm deploy  # (requires Cloudflare account + D1 configuration)
```

## Key Features

- Multi-tenant parcel tracking system
- Offline-first mutation queue (syncs when back online)
- PWA with service worker and background sync
- JWT-based authentication with tenant ID support
- Nigerian logistics context (Nigeria-first UX)
