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
  getPendingInboundScans,
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
// Core flush function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flush all pending inbound scans to the server.
 *
 * Algorithm:
 *  1. Collect all unsynced scans from every tenant via Dexie.
 *  2. Group by tenantId.
 *  3. For each tenant, call warehouse.bulkReceiveScans with the unique
 *     tracking number list.
 *  4. Mark each scan synced with its server-determined result code.
 *  5. Prune scans older than 72 hours to keep the local store lean.
 */
export async function flushInboundScans(client: InboundSyncClient): Promise<void> {
  if (isSyncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  // Collect pending scans across ALL tenants (the worker runs globally).
  // We fetch all unsynced, then filter per-tenant during grouping.
  const allTenants = await getAllPendingScansAllTenants();
  if (allTenants.length === 0) return;

  isSyncing = true;
  notifyListeners("syncing");

  let hasErrors = false;

  try {
    const groups = groupScansByTenant(allTenants);

    for (const [tenantId, scans] of Array.from(groups.entries())) {
      // De-duplicate tracking numbers within this batch (same number scanned
      // multiple times while offline should only trigger one server update).
      const uniqueByTracking = new Map<string, InboundScan>();
      for (const scan of scans) {
        if (!uniqueByTracking.has(scan.trackingNumber)) {
          uniqueByTracking.set(scan.trackingNumber, scan);
        }
      }

      const trackingNumbers = Array.from(uniqueByTracking.keys());

      try {
        const result = await client.warehouse.bulkReceiveScans.mutate({
          tenantId,
          trackingNumbers,
        });

        // Mark each unique scan synced with the server's result.
        for (const [trackingNumber, scan] of Array.from(uniqueByTracking.entries())) {
          const scanResult = resolveResultPerScan(
            trackingNumber,
            result.notFound,
            result.alreadyReceived,
          );
          if (scan.localId != null) {
            await markInboundScanSynced(scan.localId, scanResult);
          }
        }

        // Duplicate scans (same tracking scanned multiple times while offline):
        // mark them all synced with the same result code.
        const duplicates = scans.filter((s: InboundScan) => !uniqueByTracking.has(s.trackingNumber) || uniqueByTracking.get(s.trackingNumber) !== s);
        for (const dup of duplicates) {
          if (dup.localId != null) {
            const scanResult = resolveResultPerScan(
              dup.trackingNumber,
              result.notFound,
              result.alreadyReceived,
            );
            await markInboundScanSynced(dup.localId, scanResult);
          }
        }
      } catch {
        hasErrors = true;
        // Don't mark these scans synced — they'll be retried on the next flush.
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

/**
 * Internal: collect all unsynced scans across all tenants.
 * Works around the fact that we can't know all tenantIds upfront —
 * we query all unsynced records and let groupScansByTenant sort them.
 */
async function getAllPendingScansAllTenants(): Promise<InboundScan[]> {
  const { offlineDb } = await import("./offlineDb");
  return offlineDb.pendingInboundScans.where("synced").equals(0).toArray();
}

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
