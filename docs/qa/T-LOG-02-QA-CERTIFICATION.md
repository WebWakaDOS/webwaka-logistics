# QA Certification — T-LOG-02: Tamper-Evident Photo Capture for POD

**Date:** 2026-04-03
**Cert Status:** ✅ CERTIFIED — All bugs fixed, all tests passing

---

## Summary

Five bugs (2 critical, 3 minor) were identified during QA audit of the T-LOG-02
implementation and have been fully remediated. The test suite (136 tests) passes
with zero failures.

---

## Bug Register

### BUG-01 — CRITICAL: `parcels.submitPOD` sync handler never registered

| Field        | Value                                  |
|--------------|----------------------------------------|
| Severity     | Critical                               |
| Symptom      | Offline POD submissions queued in Dexie `mutationQueue` are silently skipped when device reconnects. Deliveries recorded offline are permanently lost. |
| Root Cause   | `processMutationQueue()` in `syncEngine.ts` calls `syncCallbacks.get(item.type)` and `continue`s if no handler is found. `registerSyncHandler("parcels.submitPOD", ...)` was never called anywhere. |
| Fix          | Added `registerSyncHandler("parcels.submitPOD", ...)` inside `SyncEngineInit` in `App.tsx`, using the new vanilla tRPC client (`client/src/lib/trpcVanilla.ts`) for non-React contexts. Also registered `parcels.verifyOtp` while here. |
| Files Changed | `client/src/App.tsx`, `client/src/lib/trpcVanilla.ts` (new) |

---

### BUG-02 — CRITICAL: `initPodPhotoSync()` never called

| Field        | Value                                  |
|--------------|----------------------------------------|
| Severity     | Critical                               |
| Symptom      | Watermarked photo blobs written to Dexie `podPhotos` by `savePodPhotoLocally()` accumulate indefinitely. The R2 upload worker is implemented but unreachable — blobs are never sent to cloud storage. |
| Root Cause   | `initPodPhotoSync(trpc)` in `podPhotoSyncWorker.ts` registers `window.addEventListener("online", ...)` and kicks off an initial drain. This function was never called from `App.tsx`. |
| Fix          | Called `initPodPhotoSync(trpcVanilla)` inside `SyncEngineInit` alongside `initSyncEngine()`. Cleanup function returned by `initPodPhotoSync` is called on component unmount. |
| Files Changed | `client/src/App.tsx` |

---

### BUG-03 — Minor: Camera permission detection via string matching

| Field        | Value                                  |
|--------------|----------------------------------------|
| Severity     | Minor                                  |
| Symptom      | Camera permission denial may not be caught on non-English browser locales or browsers where the error message text varies. String matching (`msg.includes("Permission")`) is locale-dependent and unreliable. |
| Root Cause   | `startCamera()` caught camera errors by inspecting `err.message` strings instead of `DOMException.name`, which is locale-independent and authoritative per the WebRTC spec. |
| Fix          | Check `err instanceof DOMException` and inspect `err.name` first (`NotAllowedError`, `PermissionDeniedError`, `NotFoundError`, `DevicesNotFoundError`). String matching kept as secondary fallback for non-DOMException errors. |
| Files Changed | `client/src/components/CameraPOD.tsx` |

---

### BUG-04 — Minor: Stale geo-promise race on retake

| Field        | Value                                  |
|--------------|----------------------------------------|
| Severity     | Minor                                  |
| Symptom      | If the user taps Retake while GPS is still resolving from a previous capture attempt, the stale `.then()` callback fires later and overwrites the correct geo state for the new capture. |
| Root Cause   | `captureGeoLocation()` returns a Promise stored in `pendingGeo`. If `startCamera()` is called again before the first promise resolves, both callbacks are still in flight. |
| Fix          | Added `geoGenRef = useRef(0)` — a generation counter incremented on every `startCamera()` call. Each invocation captures `myGen = ++geoGenRef.current`. Geo callbacks check `geoGenRef.current !== myGen` and discard the result if stale. The same check is applied after `openRearCamera()` resolves, stopping any stale stream tracks immediately. |
| Files Changed | `client/src/components/CameraPOD.tsx` |

---

### BUG-05 — Minor: Double-submit risk in `handleSubmitPOD`

| Field        | Value                                  |
|--------------|----------------------------------------|
| Severity     | Minor                                  |
| Symptom      | Between the start of `handleSubmitPOD` and the call to `podMutation.mutate()`, there are two `await` calls (`savePodPhotoLocally` + `blobToBase64`). During this window `podMutation.isPending` is `false`, so a second tap submits a duplicate POD. |
| Root Cause   | `podMutation.isPending` only becomes `true` after `podMutation.mutate()` is called. The preceding async work has no UI lock. |
| Fix          | Added `podIsSubmitting` state (`useState(false)`). Set to `true` immediately on entry, cleared in `finally`. The submit button's `disabled` prop checks `podMutation.isPending || podIsSubmitting`. Also fixed the offline path to reset `podName` and `podRelation` after queuing, which was an omission in the original code. |
| Files Changed | `client/src/pages/ParcelDetail.tsx` |

---

## Test Results

```
Test Files  8 passed (8)
Tests  136 passed (136)
Duration  3.80s
```

All 136 tests pass with zero failures. No regressions introduced.

---

## Files Modified in QA Pass

| File                                    | Purpose                                        |
|-----------------------------------------|------------------------------------------------|
| `client/src/lib/trpcVanilla.ts`         | New — vanilla tRPC client for sync workers     |
| `client/src/App.tsx`                    | BUG-01 + BUG-02 — register handlers, init sync |
| `client/src/components/CameraPOD.tsx`   | BUG-03 + BUG-04 — error detection + geo race  |
| `client/src/pages/ParcelDetail.tsx`     | BUG-05 — double-submit guard + state reset     |
