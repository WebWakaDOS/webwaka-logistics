/**
 * T-LOG-02: POD Photo Background Sync Worker
 * ───────────────────────────────────────────
 * Drains the Dexie `podPhotos` table when the device comes back online.
 * Uploads each pending watermarked blob to storage via the server's
 * `parcels.uploadPodPhoto` tRPC procedure, then marks the record synced.
 *
 * Integration: call `initPodPhotoSync(trpc)` once at app startup alongside
 * `initSyncEngine()`. The two workers operate independently.
 */

import { getPendingPodPhotos, markPodPhotoSynced } from "./offlineDb";
import { blobToBase64 } from "./photoPod";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal tRPC client interface required by this worker */
export interface PodSyncTrpcClient {
  parcels: {
    uploadPodPhoto: {
      mutate: (input: {
        tenantId: string;
        parcelId: number;
        imageBase64: string;
        lat: number | null;
        lng: number | null;
        capturedAt: number;
      }) => Promise<{ success: boolean; imageUrl?: string }>;
    };
  };
}

export type PodSyncStatus = "idle" | "syncing" | "complete" | "error";

let isSyncing = false;
let statusListeners: Array<(s: PodSyncStatus) => void> = [];

function notify(status: PodSyncStatus): void {
  statusListeners.forEach(fn => fn(status));
}

/** Subscribe to pod photo sync status */
export function onPodSyncStatus(listener: (s: PodSyncStatus) => void): () => void {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core sync logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process all pending (unsynced) POD photos.
 * Idempotent — safe to call multiple times; re-entrant calls are dropped.
 */
export async function syncPendingPodPhotos(trpc: PodSyncTrpcClient): Promise<void> {
  if (isSyncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const pending = await getPendingPodPhotos();
  if (pending.length === 0) return;

  isSyncing = true;
  notify("syncing");

  let hasErrors = false;

  for (const record of pending) {
    try {
      const imageBase64 = await blobToBase64(record.photoBlob);

      const result = await trpc.parcels.uploadPodPhoto.mutate({
        tenantId: record.tenantId,
        parcelId: record.parcelId,
        imageBase64,
        lat: record.lat,
        lng: record.lng,
        capturedAt: record.capturedAt,
      });

      if (result.success && result.imageUrl) {
        await markPodPhotoSynced(record.localId!, result.imageUrl);
      } else {
        hasErrors = true;
      }
    } catch {
      hasErrors = true;
      // Continue — don't let one failure block others
    }
  }

  isSyncing = false;
  notify(hasErrors ? "error" : "complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register online/offline event listeners for automatic POD photo sync.
 * Call once at app startup alongside `initSyncEngine()`.
 * Returns a cleanup function for use in React useEffect.
 */
export function initPodPhotoSync(trpc: PodSyncTrpcClient): () => void {
  const handleOnline = () => syncPendingPodPhotos(trpc);

  window.addEventListener("online", handleOnline);

  // Process any queued photos from a previous offline session
  if (typeof navigator === "undefined" || navigator.onLine) {
    syncPendingPodPhotos(trpc);
  }

  return () => window.removeEventListener("online", handleOnline);
}
