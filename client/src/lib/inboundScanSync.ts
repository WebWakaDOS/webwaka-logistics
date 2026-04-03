/**
 * T-LOG-04: Inbound Receiving Scanner — Background Sync Worker
 * ─────────────────────────────────────────────────────────────
 * Flushes queued barcode scans from Dexie to the server in bulk when
 * the device comes online. Works alongside the existing syncEngine.ts
 * without interfering with it.
 *
 * Architecture:
 *  - Scans are saved to Dexie instantly (zero network dependency).
 *  - On `online` event (or app startup if already online), the worker
 *    groups pending scans by tenantId and calls warehouse.bulkReceiveScans
 *    once per tenant per flush cycle.
 *  - Each scan is then marked synced with the server's result code.
 */

import {
  getAllPendingInboundScans,
  markInboundScanSynced,
  pruneOldInboundScans,
  type InboundScan,
} from "./offlineDb";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Subset of the tRPC vanilla client that this sync worker needs. */
export interface InboundSyncClient {
  warehouse: {
    bulkReceiveScans: {
      mutate: (input: {
        tenantId: string;
        trackingNumbers: string[];
      }) => Promise<{
        receivedCount: number;
        notFound: string[];
        alreadyReceived: string[];
      }>;
    };
  };
}

export type InboundSyncStatus = "idle" | "syncing" | "error" | "complete";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (testable without Dexie)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split an array into sequential chunks of at most `size` elements.
 * Used to stay within the server's Zod `max(500)` cap on bulkReceiveScans.
 *
 * @example chunkArray([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Group an array of InboundScan records by their tenantId.
 * Returns a Map of tenantId → scans so the worker can issue one
 * bulkReceiveScans call per tenant per flush cycle.
 */
export function groupScansByTenant(
  scans: InboundScan[],
): Map<string, InboundScan[]> {
  const groups = new Map<string, InboundScan[]>();
  for (const scan of scans) {
    const existing = groups.get(scan.tenantId);
    if (existing) {
      existing.push(scan);
    } else {
      groups.set(scan.tenantId, [scan]);
    }
  }
  return groups;
}

/**
 * Given the server response for a batch of scans, derive the result code
 * for each individual scan tracking number.
 */
export function resolveResultPerScan(
  trackingNumber: string,
  notFound: string[],
  alreadyReceived: string[],
): InboundScan["result"] {
  if (notFound.includes(trackingNumber)) return "not_found";
  if (alreadyReceived.includes(trackingNumber)) return "already_received";
  return "received";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync state
// ─────────────────────────────────────────────────────────────────────────────

let isSyncing = false;
let statusListeners: Array<(status: InboundSyncStatus) => void> = [];

export function onInboundSyncStatusChange(
  listener: (status: InboundSyncStatus) => void,
): () => void {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

function notifyListeners(status: InboundSyncStatus): void {
  for (const l of statusListeners) l(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum tracking numbers per server call.
 * Matches the Zod `max(500)` cap on `bulkReceiveScansInput.trackingNumbers`.
 * Large offline batches are split into chunks of this size.
 */
const BATCH_CHUNK_SIZE = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Core flush function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flush all pending inbound scans to the server.
 *
 * Algorithm:
 *  1. Collect all unsynced scans from every tenant via Dexie.
 *  2. Group by tenantId.
 *  3. For each tenant, de-duplicate tracking numbers and split into chunks
 *     of ≤ BATCH_CHUNK_SIZE (server Zod cap).
 *  4. For each chunk, call warehouse.bulkReceiveScans.
 *  5. Mark each scan synced with its server-determined result code.
 *  6. Prune scans older than 72 hours to keep the local store lean.
 */
export async function flushInboundScans(client: InboundSyncClient): Promise<void> {
  if (isSyncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  // Collect pending scans across ALL tenants (the worker runs globally).
  // We fetch all unsynced, then group per-tenant during processing.
  const allPending = await getAllPendingInboundScans();
  if (allPending.length === 0) return;

  isSyncing = true;
  notifyListeners("syncing");

  let hasErrors = false;

  try {
    const groups = groupScansByTenant(allPending);

    for (const [tenantId, scans] of Array.from(groups.entries())) {
      // De-duplicate tracking numbers within this tenant's batch.
      // If the same label was scanned multiple times while offline, only
      // one server call is needed — but ALL local records get marked synced.
      const uniqueByTracking = new Map<string, InboundScan>();
      for (const scan of scans) {
        if (!uniqueByTracking.has(scan.trackingNumber)) {
          uniqueByTracking.set(scan.trackingNumber, scan);
        }
      }

      const uniqueTrackingNumbers = Array.from(uniqueByTracking.keys());

      // ── BUG-02 fix: chunk into ≤ BATCH_CHUNK_SIZE slices ─────────────────
      // The server caps `trackingNumbers` at 500 per request (Zod validation).
      // Exceeding this returns a Zod error and none of the scans would be
      // marked synced. We split large batches into sequential chunks instead.
      const chunks = chunkArray(uniqueTrackingNumbers, BATCH_CHUNK_SIZE);

      // Accumulate the server responses across all chunks so we can mark
      // duplicates synced afterwards with the right result code.
      const aggregatedNotFound: string[] = [];
      const aggregatedAlreadyReceived: string[] = [];
      let chunkError = false;

      for (const chunk of chunks) {
        try {
          const result = await client.warehouse.bulkReceiveScans.mutate({
            tenantId,
            trackingNumbers: chunk,
          });

          aggregatedNotFound.push(...result.notFound);
          aggregatedAlreadyReceived.push(...result.alreadyReceived);

          // Mark each unique scan in this chunk synced immediately.
          for (const trackingNumber of chunk) {
            const scan = uniqueByTracking.get(trackingNumber);
            if (scan?.localId != null) {
              const scanResult = resolveResultPerScan(
                trackingNumber,
                result.notFound,
                result.alreadyReceived,
              );
              await markInboundScanSynced(scan.localId, scanResult);
            }
          }
        } catch {
          chunkError = true;
          hasErrors = true;
          // Leave this chunk's scans unsynced — they will be retried on the
          // next flush cycle (isSyncing guard is reset at the end).
        }
      }

      if (!chunkError) {
        // Mark duplicate scan records (same tracking scanned > once offline)
        // with the result derived from the aggregated server responses.
        const duplicates = scans.filter(
          (s: InboundScan) => uniqueByTracking.get(s.trackingNumber) !== s,
        );
        for (const dup of duplicates) {
          if (dup.localId != null) {
            const scanResult = resolveResultPerScan(
              dup.trackingNumber,
              aggregatedNotFound,
              aggregatedAlreadyReceived,
            );
            await markInboundScanSynced(dup.localId, scanResult);
          }
        }
      }
    }

    // Prune synced scans older than 72 hours to keep IndexedDB lean.
    const cutoff = Date.now() - 72 * 60 * 60 * 1000;
    await pruneOldInboundScans(cutoff);
  } catch {
    hasErrors = true;
  }

  isSyncing = false;
  notifyListeners(hasErrors ? "error" : "complete");
}

// getAllPendingInboundScans is imported statically from offlineDb — no dynamic
// import needed. The function queries all tenants' unsynced records.

// ─────────────────────────────────────────────────────────────────────────────
// Initialiser — attaches online/offline event listeners
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the inbound scan sync worker.
 * Returns a cleanup function that removes event listeners on unmount.
 * Call once at app startup in SyncEngineInit.
 */
export function initInboundScanSync(client: InboundSyncClient): () => void {
  const handleOnline = () => {
    flushInboundScans(client).catch(() => {
      // Silent — individual errors are tracked in notifyListeners("error")
    });
  };

  window.addEventListener("online", handleOnline);

  // If already online when the app boots, flush immediately.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    flushInboundScans(client).catch(() => {});
  }

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
