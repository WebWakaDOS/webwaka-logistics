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

## Implemented Features

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
