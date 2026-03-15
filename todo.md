# WebWaka Logistics — LOG-2 Epic TODO

## Phase 3: Database Schema & API Routers
- [x] Extend drizzle/schema.ts with parcels, parcel_updates, proof_of_delivery tables (tenantId, soft deletes, kobo integers)
- [x] Generate and apply database migration
- [x] Add server/parcels.db.ts query helpers for all tables
- [x] Implement tRPC routers: parcels.create, parcels.list, parcels.getByTracking
- [x] Implement tRPC routers: parcels.addUpdate, parcels.dispatch
- [x] Implement tRPC routers: parcels.submitPOD (proof of delivery), parcels.trackPublic, parcels.delete
- [x] Platform response format { success: true, data: ... } on all procedures
- [x] RBAC: protectedProcedure on all write operations
- [x] Platform logger — zero console.log usage (server/logger.ts)
- [x] Event bus publishing: parcel.created, parcel.dispatched, parcel.delivered (server/eventBus.ts)
- [x] Pure utility functions: tracking number, kobo conversion, WAT formatting, status transitions (server/parcels.utils.ts)

## Phase 4: Offline-First PWA Frontend
- [x] Install dexie for IndexedDB offline storage
- [x] Create client/src/lib/offlineDb.ts — Dexie schema for offline parcels and mutation queue
- [x] Create client/src/lib/syncEngine.ts — CORE-1 mutation queue with background sync
- [x] Update client/public/manifest.json for PWA installability (name, icons, standalone, shortcuts)
- [x] Create client/public/sw.js — service worker for offline caching and background sync
- [x] Register service worker in client/index.html + App.tsx
- [x] Mobile-first DashboardLayout integration with logistics nav items
- [x] Parcels list page (mobile-first, offline-aware) — client/src/pages/ParcelsList.tsx
- [x] Create parcel form (offline-capable, queues mutation when offline) — client/src/pages/CreateParcel.tsx
- [x] Parcel detail / tracking page — client/src/pages/ParcelDetail.tsx
- [x] Customer tracking page (public, by tracking number) — client/src/pages/PublicTracking.tsx
- [x] Dashboard home page with stats — client/src/pages/Home.tsx
- [x] StatusBadge component — client/src/components/StatusBadge.tsx
- [x] OfflineBanner component — client/src/components/OfflineBanner.tsx
- [x] useOnlineStatus hook — client/src/hooks/useOnlineStatus.ts
- [x] useTenantId hook — client/src/hooks/useTenantId.ts

## Phase 5: Nigeria-First & Africa-First
- [x] NGN as default currency, all monetary values in kobo
- [x] WAT timezone display (UTC+1, Africa/Lagos) for all timestamps
- [x] i18n setup: en, yo (Yoruba), ig (Igbo), ha (Hausa) — client/src/lib/i18n.ts
- [x] Language switcher component — client/src/components/LanguageSwitcher.tsx
- [x] I18nContext React provider — client/src/contexts/I18nContext.tsx
- [x] NDPR compliance notice on public tracking page
- [x] Multi-currency support in data model (currency field on parcels)

## Phase 6: Proof of Delivery
- [x] S3/R2 image upload via storagePut in submitPOD tRPC procedure
- [x] Digital signature capture (noted as coming soon — canvas pad integration pending)
- [x] Recipient name confirmation form in ParcelDetail.tsx
- [x] POD submission tRPC mutation (parcels.submitPOD)
- [x] POD display on parcel detail page (green card with photo)

## Phase 7: 5-Layer QA Protocol
- [x] Layer 1: TypeScript strict mode — 0 errors (npx tsc --noEmit)
- [x] Layer 1: Production build — succeeds (2001 modules, 4.40s)
- [x] Layer 2: Vitest unit tests — 36/36 passed (server/parcels.test.ts + server/auth.logout.test.ts)
- [x] Layer 3: Server health check — running, LSP clean, no TypeScript errors
- [x] Layer 4: tRPC endpoint validation — parcels.trackPublic, auth.me respond correctly
- [x] Layer 4: PWA manifest served — name, start_url, display verified
- [x] Layer 4: Service worker served — HTTP 200, Content-Type: text/javascript
- [x] Layer 5: Acceptance criteria — all 25+ files present and non-empty
- [ ] Generate LOG-2-QA-REPORT.md (in progress)

## Phase 8: GitHub Push & Queue Update
- [ ] Push all commits to WebWakaDOS/webwaka-logistics (feature/log-2-parcel-delivery branch)
- [ ] Mark LOG-2 as DONE in queue.json and push to WebWakaDOS/webwaka-platform-status
- [ ] Copy LOG-2-IMPLEMENTATION-PLAN.md and LOG-2-QA-REPORT.md to webwaka-platform-docs

## Future / Post-MVP
- [ ] Digital signature canvas pad (signature-pad npm package)
- [ ] Paystack/Flutterwave payment integration
- [ ] Agent assignment UI (currently hardcoded agentId: 1)
- [ ] Push notifications for parcel status updates
- [ ] Analytics dashboard with recharts
