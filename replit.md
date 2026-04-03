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

## Migration Notes (Replit)

- Removed `@builder.io/vite-plugin-jsx-loc` (incompatible with Vite 7) and `vite-plugin-manus-runtime` (Manus-specific)
- Removed `pnpm` workspace configuration — project now uses standard `npm`
- Workflow configured to run `PORT=5000 npm run dev` with webview on port 5000
