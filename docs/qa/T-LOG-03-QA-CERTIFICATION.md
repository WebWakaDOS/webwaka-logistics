# T-LOG-03 QA Certification Report
## Geospatial Order Clustering for Dispatch

**Task:** T-LOG-03 — Implement lightweight D1-compatible order clustering, Dispatcher UI, and rider assignment  
**Audit Date:** 2026-04-03  
**Auditor:** QA/Bug-Fix Agent  
**Status:** ✅ CERTIFIED — All bugs fixed, 173/173 tests passing

---

## 1. Scope Review

| Component | File | In Scope |
|---|---|---|
| Clustering algorithm | `server/clustering.ts` | ✅ |
| DB helpers | `server/dispatch.db.ts` | ✅ |
| tRPC dispatch router | `server/routers/dispatch.ts` | ✅ |
| Dispatcher UI | `client/src/pages/Dispatch.tsx` | ✅ |
| Router registration | `server/routers.ts` | ✅ |
| Unit tests | `server/__tests__/clustering.test.ts` | ✅ |
| Schema migration | `server/db.ts` (T-LOG-03 section) | ✅ |

---

## 2. D1 Compatibility Audit

**Result: PASS** — Implementation is fully D1/SQLite compatible.

| Check | Finding |
|---|---|
| PostGIS / spatial extensions | None used. All geo computation is pure TypeScript arithmetic. |
| Grid snapping | `Math.round(value / precision) * precision` — pure arithmetic, no SQL functions. |
| Text clustering fallback | String normalisation in TypeScript, no SQL LIKE or regex. |
| `COUNT(*)` aggregation | Standard SQLite syntax via Drizzle `sql\`count(*)\`` — D1 supported. |
| `IN (...)` clause | Bounded at 200 items via Zod schema — well within SQLite/D1 limits. |
| `ALTER TABLE ADD COLUMN` migration | Standard SQLite DDL — D1 supported. Idempotent guard present. |

---

## 3. Multi-Tenant Isolation Audit

**Result: PASS** — All data-mutating paths enforce `tenantId` at the DB layer.

| Function | Tenant Guard |
|---|---|
| `getUnassignedParcels(tenantId)` | `eq(parcels.tenantId, tenantId)` in WHERE ✅ |
| `bulkAssignParcels(tenantId, ...)` | `AND eq(parcels.tenantId, tenantId)` guards UPDATE ✅ |
| `unassignParcels(tenantId, ...)` | `AND eq(parcels.tenantId, tenantId)` guards UPDATE ✅ |
| `updateParcelCoordinates(tenantId, ...)` | `AND eq(parcels.tenantId, tenantId)` guards UPDATE ✅ |
| `getDispatchSummary(tenantId)` | `eq(parcels.tenantId, tenantId)` in all COUNT queries ✅ |
| `getAvailableAgents()` | Intentionally cross-tenant — users table is a shared platform pool with no tenantId column. Documented with upgrade path. ✅ |
| `getClusters` tRPC endpoint | `tenantId` from validated input passed to `getUnassignedParcels` ✅ |
| `assignCluster` tRPC endpoint | `tenantId` from validated input passed to `bulkAssignParcels` ✅ |

---

## 4. Bugs Found and Fixed

### BUG-01 — CRITICAL: Cache never invalidated after cluster assignment

| Field | Detail |
|---|---|
| **Severity** | Critical |
| **File** | `client/src/pages/Dispatch.tsx` lines 346-347 |
| **Root Cause** | `queryClient.invalidateQueries({ queryKey: ["/api/trpc/dispatch.getClusters"] })` used HTTP path strings as TanStack Query keys. tRPC uses internal `[["dispatch", "getClusters"], ...]` array format — the string keys never matched, so cache was **never invalidated** after assignment. The cluster list and summary stats remained stale until a full page reload. |
| **Fix Applied** | Replaced `useQueryClient()` + raw `invalidateQueries` with `trpc.useUtils()` and typed `utils.dispatch.getClusters.invalidate({ tenantId })` / `utils.dispatch.getSummary.invalidate({ tenantId })`. Also updated success toast to show `data.assignedCount` (actual DB count) instead of `vars.parcelIds.length` (input count). |

---

### BUG-02 — MEDIUM: `bulkAssignParcels` reported wrong assigned count

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **File** | `server/dispatch.db.ts` line 70 |
| **Root Cause** | Function returned `parcelIds.length` — the number of IDs submitted, regardless of how many were actually updated in the database. If any IDs didn't belong to the tenant or were soft-deleted, the reported count was inflated. |
| **Fix Applied** | Captured `const result = db.update(...).run()` return value and returned `result.changes ?? parcelIds.length`. The `changes` property from better-sqlite3's `RunResult` reflects the true number of rows updated. |

---

### BUG-03 — MEDIUM: No agent existence validation before assignment

| Field | Detail |
|---|---|
| **Severity** | Medium |
| **File** | `server/routers/dispatch.ts` — `assignCluster` mutation |
| **Root Cause** | `agentId` was validated only as a positive integer by Zod. Any arbitrary integer could be supplied; parcels would be silently assigned to a non-existent agent ID. |
| **Fix Applied** | Before calling `bulkAssignParcels`, the handler now calls `getAvailableAgents()` and verifies `input.agentId` exists in the eligible pool. If not found, a `TRPCError({ code: "BAD_REQUEST" })` is thrown with a descriptive message. |

---

### BUG-04 — MINOR: Unused import `TRPCError` (pre-fix)

| Field | Detail |
|---|---|
| **Severity** | Minor |
| **File** | `server/routers/dispatch.ts` line 8 |
| **Root Cause** | `TRPCError` was imported but never used in the original implementation. |
| **Fix Applied** | Now used correctly in the BUG-03 agent validation guard — import retained and justified. |

---

### BUG-05 — MINOR: Unused type import `User`

| Field | Detail |
|---|---|
| **Severity** | Minor |
| **File** | `server/dispatch.db.ts` line 7 |
| **Root Cause** | `type User` was imported from the schema but never referenced in the file. |
| **Fix Applied** | Removed from import statement. |

---

### BUG-06 — MINOR: `getDispatchSummary` loaded all parcel rows into JS memory

| Field | Detail |
|---|---|
| **Severity** | Minor (performance) |
| **File** | `server/dispatch.db.ts` — `getDispatchSummary` |
| **Root Cause** | The function fetched every non-deleted parcel for the tenant (`SELECT status, assignedAgentId FROM parcels WHERE ...`), then counted in JavaScript. For tenants with thousands of parcels this would be slow and memory-intensive. |
| **Fix Applied** | Replaced with three SQL `COUNT(*)` queries using Drizzle's typed `sql` helper and proper `WHERE` predicates. Each is a single indexed scan. D1-compatible — standard SQLite aggregation. |

---

### BUG-07 — DOCUMENTATION: Cross-tenant agent pool undocumented

| Field | Detail |
|---|---|
| **Severity** | Documentation |
| **File** | `server/dispatch.db.ts` — `getAvailableAgents` |
| **Root Cause** | Function is intentionally cross-tenant (users table has no `tenantId` column) but had no comment explaining this design decision. Could be mistaken for a missing tenant filter. |
| **Fix Applied** | Added a `NOTE` comment explaining the shared platform pool design and providing an upgrade path (`userTenants` join table) if per-tenant agent pools are needed in future. |

---

## 5. Test Results

```
Test Files  9 passed (9)
     Tests  173 passed (173)
  Duration  3.43s
```

All 173 tests pass post-fix, including:
- 37 T-LOG-03 clustering unit tests (`server/__tests__/clustering.test.ts`)
- 136 pre-existing tests (OTP, POD, parcel CRUD, delivery routing, integration, auth)

---

## 6. Invariant Compliance

| WebWaka Invariant | Status |
|---|---|
| `@webwaka/core` Termii for SMS (T-LOG-01) | Not touched by T-LOG-03 ✅ |
| Mobile/PWA/Offline-first (Dexie + background sync) | Dispatch UI is online-only (admin console); does not break offline invariant ✅ |
| Gallery uploads BLOCKED — live camera only (T-LOG-02) | Not touched by T-LOG-03 ✅ |
| D1/SQLite safe — no PostGIS | Pure TypeScript clustering + standard Drizzle queries ✅ |
| Multi-tenant: all queries scoped by `tenantId` | Enforced at DB layer before clustering; all write mutations double-scoped ✅ |

---

## 7. Certification Decision

**T-LOG-03 is CERTIFIED** for merge.

All 6 bugs identified during audit have been remediated. The implementation correctly:
- Runs entirely in TypeScript without any SQL spatial extensions (D1 compatible)
- Enforces strict `tenantId` isolation at the database layer before clustering
- Uses type-safe tRPC cache invalidation that actually refreshes the dispatcher UI
- Reports accurate DB change counts back to the UI
- Validates agent eligibility before assignment, preventing ghost assignments
- Scales summary statistics with SQL aggregation rather than JS-side row scanning
