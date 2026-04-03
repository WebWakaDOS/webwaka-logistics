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
  | "parcels.submitPOD"
  | "parcels.verifyOtp";

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
// L-06: Offline OTP Cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stores the offline fallback token for a parcel's OTP.
 * When the rider is offline at the customer's door, the app uses this to verify
 * the OTP client-side without hitting the server.
 */
export interface OfflineOtpCache {
  /** Local IndexedDB auto-increment key */
  localId?: number;
  /** Server-assigned parcel ID */
  parcelId: number;
  /**
   * 12-char HMAC token pre-computed by the server on addUpdate(OUT_FOR_DELIVERY).
   * Used for offline OTP verification: verifyOfflineToken(parcelId, enteredOtp, this)
   */
  offlineToken: string;
  /** Unix timestamp when this cache entry expires (matches server otpExpiresAt) */
  expiresAt: number;
  /** Tracking number — for display purposes only */
  trackingNumber: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dexie Database Definition
// ─────────────────────────────────────────────────────────────────────────────

class WebWakaLogisticsDB extends Dexie {
  parcels!: Table<OfflineParcel, number>;
  mutationQueue!: Table<MutationQueueItem, number>;
  otpCache!: Table<OfflineOtpCache, number>;

  constructor() {
    super("webwaka-logistics-v1");

    this.version(1).stores({
      /** Indexed by localId (auto), clientId, tenantId, synced */
      parcels: "++localId, clientId, tenantId, synced, status",
      /** Mutation queue for offline-first sync [Part 6, CORE-1] */
      mutationQueue: "++localId, type, synced, createdAt",
    });

    this.version(2).stores({
      parcels: "++localId, clientId, tenantId, synced, status",
      mutationQueue: "++localId, type, synced, createdAt",
      /** L-06: Offline OTP cache — keyed by parcelId for fast lookup */
      otpCache: "++localId, parcelId, expiresAt",
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

// ─────────────────────────────────────────────────────────────────────────────
// L-06: Offline OTP Cache Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Store the server-issued offline OTP token in Dexie for a specific parcel */
export async function cacheOfflineOtpToken(
  parcelId: number,
  trackingNumber: string,
  offlineToken: string,
  expiresAt: number,
): Promise<void> {
  // Remove any stale entry for this parcel
  await offlineDb.otpCache.where("parcelId").equals(parcelId).delete();
  await offlineDb.otpCache.add({ parcelId, trackingNumber, offlineToken, expiresAt });
}

/** Retrieve the cached offline OTP entry for a parcel */
export async function getCachedOtpToken(parcelId: number): Promise<OfflineOtpCache | undefined> {
  return offlineDb.otpCache.where("parcelId").equals(parcelId).first();
}

/**
 * Client-side HMAC-based offline OTP verification.
 * Mirrors buildOfflineToken() from server/otp.ts but uses WebCrypto API.
 */
export async function verifyOtpOffline(
  parcelId: number,
  enteredOtp: string,
  cachedToken: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const OFFLINE_HMAC_KEY = "webwaka-logistics-offline-otp-fallback";

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(OFFLINE_HMAC_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const data = encoder.encode(`${parcelId}|${enteredOtp}`);
    const sig = await crypto.subtle.sign("HMAC", key, data);
    const hex = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);

    return hex === cachedToken;
  } catch {
    return false;
  }
}

/** Clear expired OTP cache entries */
export async function pruneExpiredOtpCache(): Promise<void> {
  const now = Date.now();
  await offlineDb.otpCache.where("expiresAt").below(now).delete();
}
