/**
 * Offline-First Database — CORE-1 Universal Offline Sync Engine [Part 6]
 * Blueprint: "Offline-first with IndexedDB (Dexie) and mutation queue."
 * All parcel operations are queued locally when offline and synced when reconnected.
 */

import Dexie, { type Table } from "dexie";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MutationType =
  | "parcels.create"
  | "parcels.addUpdate"
  | "parcels.dispatch"
  | "parcels.submitPOD";

export interface OfflineParcel {
  /** Local IndexedDB auto-increment key */
  localId?: number;
  /** Client-generated UUID for deduplication */
  clientId: string;
  tenantId: string;
  trackingNumber?: string;
  status: string;
  priority: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState: string;
  description?: string;
  weightGrams: number;
  deliveryFeeKobo: number;
  insuranceValueKobo: number;
  currency: string;
  /** Server-assigned ID once synced */
  serverId?: number;
  synced: boolean;
  createdAt: number;
}

export interface MutationQueueItem {
  localId?: number;
  type: MutationType;
  /** JSON-serialised input payload */
  payload: string;
  /** Number of retry attempts */
  retries: number;
  /** Unix timestamp of last attempt */
  lastAttemptAt?: number;
  createdAt: number;
  /** Whether this mutation has been successfully synced */
  synced: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dexie Database Definition
// ─────────────────────────────────────────────────────────────────────────────

class WebWakaLogisticsDB extends Dexie {
  parcels!: Table<OfflineParcel, number>;
  mutationQueue!: Table<MutationQueueItem, number>;

  constructor() {
    super("webwaka-logistics-v1");

    this.version(1).stores({
      /** Indexed by localId (auto), clientId, tenantId, synced */
      parcels: "++localId, clientId, tenantId, synced, status",
      /** Mutation queue for offline-first sync [Part 6, CORE-1] */
      mutationQueue: "++localId, type, synced, createdAt",
    });
  }
}

export const offlineDb = new WebWakaLogisticsDB();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a client-side UUID for offline record deduplication */
export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/** Enqueue a mutation for background sync [Part 6, CORE-1] */
export async function enqueueMutation(type: MutationType, payload: unknown): Promise<void> {
  await offlineDb.mutationQueue.add({
    type,
    payload: JSON.stringify(payload),
    retries: 0,
    createdAt: Date.now(),
    synced: false,
  });
}

/** Get all pending (unsynced) mutations */
export async function getPendingMutations(): Promise<MutationQueueItem[]> {
  return offlineDb.mutationQueue.where("synced").equals(0).toArray();
}

/** Mark a mutation as synced */
export async function markMutationSynced(localId: number): Promise<void> {
  await offlineDb.mutationQueue.update(localId, { synced: true });
}

/** Save a parcel to the local offline store */
export async function saveOfflineParcel(parcel: Omit<OfflineParcel, "localId">): Promise<number> {
  return offlineDb.parcels.add(parcel);
}

/** Get all unsynced local parcels */
export async function getUnsyncedParcels(): Promise<OfflineParcel[]> {
  return offlineDb.parcels.where("synced").equals(0).toArray();
}

/** Update a local parcel's server ID after sync */
export async function markParcelSynced(localId: number, serverId: number, trackingNumber: string): Promise<void> {
  await offlineDb.parcels.update(localId, { synced: true, serverId, trackingNumber });
}

/** Get all local parcels for a tenant (for offline list view) */
export async function getLocalParcels(tenantId: string): Promise<OfflineParcel[]> {
  return offlineDb.parcels.where("tenantId").equals(tenantId).reverse().sortBy("createdAt");
}
