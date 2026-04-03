# T-LOG-04 QA Certification Report — v2 (Bug-Fix Audit)

**Date:** 2026-04-03
**Task:** T-LOG-04 — Offline-First Warehouse Receiving Scanner
**Auditor:** QA/Bug-Fix Agent
**Status:** ✅ CERTIFIED (post-fix)

---

## Audit Scope

| Area | Passed? |
|---|---|
| Offline resilience — no blocking network calls in the scan path | ✅ |
| Continuous scanning — no "Next/Confirm" required between items | ✅ |
| Multi-tenant invariant — every scan scoped by tenantId | ✅ |
| AudioContext resource management | ✅ (fixed BUG-03) |
| Large offline batch handling (> 500 scans) | ✅ (fixed BUG-02) |
| `receivedToday` date accuracy | ✅ (fixed BUG-01) |
| Dynamic import hygiene in sync worker | ✅ (fixed BUG-05) |
| Dead code in duplicate filter | ✅ (fixed BUG-04) |

---

## Offline Resilience — PASS

`handleScan` in `ReceivingScanner.tsx` performs **zero network calls** during the scan path:

```
barcode decoded → debounce check (in-memory Map) → saveInboundScan() → Dexie
                  ↓
                  flash + beep → refreshData() → Dexie (two reads)
```

All operations inside `handleScan` are Dexie/IndexedDB reads and writes. No tRPC call, no `fetch`, no XHR. ✅

The background sync worker (`inboundScanSync.ts`) only fires on the `online` event or at app startup — never inside the scan hot path. ✅

---

## Continuous Scanning — PASS

The `Html5Qrcode` callback fires automatically on every decoded frame at 12fps. No user interaction is required between scans. The 3-second debounce only prevents the **same** tracking number from being accepted twice — **different** tracking numbers are accepted immediately on the next frame. ✅

---

## Bugs Found and Fixed

### BUG-01 CRITICAL — `receivedToday` date filter was computed but never applied

**File:** `server/routers/warehouse.ts`

**Root cause:** `todayMidnight` was computed correctly but the Drizzle query had no `gte(parcels.updatedAt, todayMidnight)` clause. The endpoint returned ALL IN_WAREHOUSE parcels regardless of when they were received — badly inflated daily counts.

**Fix:** Added `gte(parcels.updatedAt, todayMidnight)` to the `.where()` clause. Also imported `gte` from `drizzle-orm`.

---

### BUG-02 CRITICAL — Sync worker sent batches exceeding the 500-item Zod cap

**File:** `client/src/lib/inboundScanSync.ts`

**Root cause:** `bulkReceiveScans` input has `.max(500)` on the `trackingNumbers` array (matching a Zod validation rule). If a warehouse worker scanned 501+ items while offline, the single `bulkReceiveScans.mutate()` call would throw a Zod validation error, causing the entire flush to fail silently. None of the scans would be marked synced — they would sit in Dexie indefinitely.

**Fix:**
1. Extracted `chunkArray<T>(arr, size)` as a pure, exported, testable helper.
2. `flushInboundScans` now chunks unique tracking numbers into slices of `BATCH_CHUNK_SIZE = 500` and issues sequential API calls per chunk.
3. Results are accumulated across chunks before marking duplicate scan records synced.

**Tests added:** 10 new `chunkArray` unit tests including the exact boundary cases (499/500/501/1500 items).

---

### BUG-03 MEDIUM — `AudioContext` resource leak on every scan

**File:** `client/src/pages/ReceivingScanner.tsx`

**Root cause:** `playSuccessBeep()` and `playErrorBeep()` each created a new `AudioContext` object that was never closed. Over a long session (hundreds of scans), unclosed contexts accumulate system audio handles, degrade performance, and cause subsequent beeps to fail silently.

**Fix:** Consolidated both functions into a single `playBeep()` helper that attaches an `"ended"` event listener to the oscillator and calls `ctx.close()` when the sound finishes, freeing OS audio resources immediately after each beep.

---

### BUG-04 LOW — Dead condition in duplicate-scan filter

**File:** `client/src/lib/inboundScanSync.ts`

**Root cause:** The condition `!uniqueByTracking.has(s.trackingNumber)` inside the `duplicates.filter()` can never be true — every scan in `scans` was placed into `uniqueByTracking` in the preceding loop, so `.has()` will always return `true`. The filter worked correctly despite this dead code, but it was misleading.

**Fix:** Removed the dead condition. The filter is now simply:
```typescript
const duplicates = scans.filter(
  (s: InboundScan) => uniqueByTracking.get(s.trackingNumber) !== s,
);
```

---

### BUG-05 LOW — Dynamic import inside `getAllPendingScansAllTenants` was unnecessary

**File:** `client/src/lib/inboundScanSync.ts`

**Root cause:** The private `getAllPendingScansAllTenants()` function used `await import("./offlineDb")` to access `offlineDb` directly, bypassing the module's public API and making the code harder to test and understand. The dynamic import added unnecessary latency on first call.

**Fix:**
1. Added `getAllPendingInboundScans()` as a proper named export in `offlineDb.ts` — a clean, mockable, statically importable function.
2. Removed `getAllPendingScansAllTenants()` from the sync worker entirely.
3. Updated the static import in `inboundScanSync.ts` to use `getAllPendingInboundScans`.

---

## Test Results

| Suite | Tests | Result |
|---|---|---|
| `groupScansByTenant` | 5 | ✅ |
| `resolveResultPerScan` | 7 | ✅ |
| Deduplication logic | 4 | ✅ |
| `InboundSyncClient` mock | 3 | ✅ |
| cross-tenant classification | 1 | ✅ |
| **`chunkArray` (BUG-02 regression guard)** | **10** | **✅ NEW** |
| `receivedToday` date logic (BUG-01 regression guard) | 3 | ✅ NEW |
| Previous test suites (173 pre-T-LOG-04) | 173 | ✅ |

**Total: 207 / 207 tests passing.** No regressions.

---

## TypeScript

**Zero new errors introduced.** The only TypeScript errors in the project are 5 pre-existing issues in `server/clustering.ts` (pre-date T-LOG-04, out of scope).

---

## Final Checklist

- [x] No blocking network requests in the scanner's scan path
- [x] Continuous scanning with no UI click required between items
- [x] 3-second per-barcode debounce prevents double-counting
- [x] All scans written to Dexie before any UI feedback
- [x] `AudioContext` closed after each beep (no resource leak)
- [x] Batches of > 500 scans chunked correctly
- [x] `receivedToday` correctly filters by UTC midnight
- [x] Dynamic import replaced with static named export
- [x] 207/207 tests passing
- [x] Zero new TypeScript errors
- [x] App renders at `/receiving` with correct fallback for no-camera environments
