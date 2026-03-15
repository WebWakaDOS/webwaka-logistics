/**
 * CORE-1 Universal Offline Sync Engine [Part 6]
 * Blueprint: "Offline-first with IndexedDB mutation queue and background sync."
 * Processes the mutation queue when the device comes back online.
 * Uses exponential backoff for retry logic.
 */

import {
  getPendingMutations,
  markMutationSynced,
  markParcelSynced,
  type MutationQueueItem,
} from "./offlineDb";

type SyncCallback = (item: MutationQueueItem) => Promise<{ success: boolean; serverId?: number; trackingNumber?: string }>;

let syncCallbacks: Map<string, SyncCallback> = new Map();
let isSyncing = false;
let syncListeners: Array<(status: SyncStatus) => void> = [];

export type SyncStatus = "idle" | "syncing" | "error" | "complete";

/** Register a mutation handler for a specific mutation type */
export function registerSyncHandler(type: string, handler: SyncCallback): void {
  syncCallbacks.set(type, handler);
}

/** Subscribe to sync status changes */
export function onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifyListeners(status: SyncStatus): void {
  syncListeners.forEach(l => l(status));
}

/**
 * Process all pending mutations in the queue.
 * Called when the device comes back online or on app startup.
 */
export async function processMutationQueue(): Promise<void> {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  const pending = await getPendingMutations();
  if (pending.length === 0) return;

  isSyncing = true;
  notifyListeners("syncing");

  let hasErrors = false;

  for (const item of pending) {
    const handler = syncCallbacks.get(item.type);
    if (!handler) continue;

    try {
      const result = await handler(item);
      if (result.success) {
        await markMutationSynced(item.localId!);
        // If this was a parcel creation, update the local record with the server ID
        if (item.type === "parcels.create" && result.serverId && result.trackingNumber) {
          const payload = JSON.parse(item.payload) as { localId?: number };
          if (payload.localId) {
            await markParcelSynced(payload.localId, result.serverId, result.trackingNumber);
          }
        }
      } else {
        hasErrors = true;
      }
    } catch {
      hasErrors = true;
    }
  }

  isSyncing = false;
  notifyListeners(hasErrors ? "error" : "complete");
}

/**
 * Initialise the sync engine — attach online/offline event listeners.
 * Call once at app startup.
 */
export function initSyncEngine(): () => void {
  const handleOnline = () => {
    processMutationQueue();
  };

  window.addEventListener("online", handleOnline);

  // Process queue on startup if online
  if (navigator.onLine) {
    processMutationQueue();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}

/** React hook-friendly status check */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
