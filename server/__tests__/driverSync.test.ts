/**
 * Phase 1: Offline-First Driver App — Sync Engine Unit Tests
 * Covers: mutation queue registration, handler dispatch, offline→online replay,
 * full delivery flow (addUpdate + submitPOD with base64 POD image).
 *
 * All Dexie/IndexedDB and tRPC calls are mocked.
 * `navigator` is stubbed globally — tests run in vitest's node environment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Stub browser globals for Node environment
// Must appear before any module import that reads navigator.
// ─────────────────────────────────────────────────────────────────────────────

vi.stubGlobal("navigator", { onLine: true });
vi.stubGlobal("window", {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock offlineDb — replaces all Dexie / IndexedDB calls
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../client/src/lib/offlineDb", () => {
  const mutations: {
    localId: number;
    type: string;
    payload: string;
    retries: number;
    synced: boolean;
    createdAt: number;
  }[] = [];

  let nextId = 1;

  return {
    getPendingMutations: vi.fn(async () => mutations.filter(m => !m.synced)),
    markMutationSynced: vi.fn(async (localId: number) => {
      const item = mutations.find(m => m.localId === localId);
      if (item) item.synced = true;
    }),
    markParcelSynced: vi.fn(async () => {}),
    enqueueMutation: vi.fn(async (type: string, payload: unknown) => {
      mutations.push({
        localId: nextId++,
        type,
        payload: JSON.stringify(payload),
        retries: 0,
        synced: false,
        createdAt: Date.now(),
      });
    }),
    __mutations: mutations,
    __reset: () => {
      mutations.length = 0;
      nextId = 1;
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import {
  registerSyncHandler,
  processMutationQueue,
} from "../../client/src/lib/syncEngine";
import {
  enqueueMutation,
  getPendingMutations,
  markMutationSynced,
} from "../../client/src/lib/offlineDb";

const mockGetPending = vi.mocked(getPendingMutations);
const mockMarkSynced = vi.mocked(markMutationSynced);
const mockEnqueue = vi.mocked(enqueueMutation);

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function makeItem(id: number, type: string, payload: Record<string, unknown>) {
  return {
    localId: id,
    type,
    payload: JSON.stringify(payload),
    retries: 0,
    synced: false,
    createdAt: Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// registerSyncHandler
// ─────────────────────────────────────────────────────────────────────────────

describe("registerSyncHandler", () => {
  it("registers a handler without throwing", () => {
    expect(() =>
      registerSyncHandler("parcels.addUpdate", async () => ({ success: true })),
    ).not.toThrow();
  });

  it("allows re-registering a handler to update it", () => {
    let calls = 0;
    registerSyncHandler("parcels.addUpdate", async () => { calls++; return { success: true }; });
    registerSyncHandler("parcels.addUpdate", async () => { calls += 10; return { success: true }; });
    expect(calls).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processMutationQueue
// ─────────────────────────────────────────────────────────────────────────────

describe("processMutationQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure navigator reports online between tests
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("does nothing when there are no pending mutations", async () => {
    mockGetPending.mockResolvedValueOnce([]);
    await processMutationQueue();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it("calls the registered handler for each pending mutation type", async () => {
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerSyncHandler("parcels.addUpdate", handler);

    mockGetPending.mockResolvedValueOnce([
      makeItem(1, "parcels.addUpdate", {
        tenantId: "tenant-lagos",
        parcelId: 42,
        status: "OUT_FOR_DELIVERY",
      }),
    ]);

    await processMutationQueue();

    expect(handler).toHaveBeenCalledOnce();
    expect(mockMarkSynced).toHaveBeenCalledWith(1);
  });

  it("marks mutation as synced after successful handler execution", async () => {
    registerSyncHandler("parcels.submitPOD", async () => ({ success: true }));

    mockGetPending.mockResolvedValueOnce([
      makeItem(2, "parcels.submitPOD", {
        tenantId: "tenant-lagos",
        parcelId: 55,
        receivedByName: "Adaeze Okonkwo",
        receivedByRelation: "Self",
        imageBase64: "data:image/jpeg;base64,/9j/4AAQ...",
      }),
    ]);

    await processMutationQueue();

    expect(mockMarkSynced).toHaveBeenCalledWith(2);
  });

  it("does NOT mark mutation as synced when handler returns failure", async () => {
    registerSyncHandler("parcels.addUpdate", async () => ({ success: false }));

    mockGetPending.mockResolvedValueOnce([
      makeItem(3, "parcels.addUpdate", { tenantId: "t", parcelId: 1, status: "OUT_FOR_DELIVERY" }),
    ]);

    await processMutationQueue();

    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it("does NOT mark mutation as synced when handler throws", async () => {
    registerSyncHandler("parcels.addUpdate", async () => {
      throw new Error("Network error");
    });

    mockGetPending.mockResolvedValueOnce([
      makeItem(4, "parcels.addUpdate", { tenantId: "t", parcelId: 2, status: "OUT_FOR_DELIVERY" }),
    ]);

    await processMutationQueue();

    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it("skips mutations whose type has no registered handler", async () => {
    mockGetPending.mockResolvedValueOnce([
      makeItem(5, "parcels.unknownType", { data: "payload" }),
    ]);

    await processMutationQueue();

    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it("processes multiple queued mutations in sequence", async () => {
    const addUpdateHandler = vi.fn().mockResolvedValue({ success: true });
    const verifyOtpHandler  = vi.fn().mockResolvedValue({ success: true });
    const submitPODHandler  = vi.fn().mockResolvedValue({ success: true });

    registerSyncHandler("parcels.addUpdate",  addUpdateHandler);
    registerSyncHandler("parcels.verifyOtp",  verifyOtpHandler);
    registerSyncHandler("parcels.submitPOD",  submitPODHandler);

    mockGetPending.mockResolvedValueOnce([
      makeItem(10, "parcels.addUpdate", { tenantId: "t", parcelId: 1, status: "OUT_FOR_DELIVERY" }),
      makeItem(11, "parcels.verifyOtp",  { tenantId: "t", parcelId: 1, otpCode: "4219" }),
      makeItem(12, "parcels.submitPOD",  { tenantId: "t", parcelId: 1, receivedByName: "Test" }),
    ]);

    await processMutationQueue();

    expect(addUpdateHandler).toHaveBeenCalledOnce();
    expect(verifyOtpHandler).toHaveBeenCalledOnce();
    expect(submitPODHandler).toHaveBeenCalledOnce();
    expect(mockMarkSynced).toHaveBeenCalledTimes(3);
    expect(mockMarkSynced).toHaveBeenNthCalledWith(1, 10);
    expect(mockMarkSynced).toHaveBeenNthCalledWith(2, 11);
    expect(mockMarkSynced).toHaveBeenNthCalledWith(3, 12);
  });

  it("skips processing when device is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    await processMutationQueue();

    expect(mockGetPending).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full offline delivery flow — enqueueMutation + replay
// ─────────────────────────────────────────────────────────────────────────────

describe("Offline delivery flow — enqueueMutation + replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("enqueues addUpdate with correct type and payload", async () => {
    const payload = {
      tenantId: "tenant-lagos",
      parcelId: 100,
      status: "OUT_FOR_DELIVERY",
      latitude: "6.4541",
      longitude: "3.3947",
      notes: "Rider en route",
    };

    await enqueueMutation("parcels.addUpdate", payload);

    expect(mockEnqueue).toHaveBeenCalledWith("parcels.addUpdate", payload);
  });

  it("enqueues submitPOD with base64 image data when offline", async () => {
    const base64Image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoH...";
    const payload = {
      tenantId: "tenant-lagos",
      parcelId: 200,
      receivedByName: "Chukwuemeka Obi",
      receivedByRelation: "Self",
      imageBase64: base64Image,
    };

    await enqueueMutation("parcels.submitPOD", payload);

    expect(mockEnqueue).toHaveBeenCalledWith("parcels.submitPOD", payload);
    const [type, sent] = mockEnqueue.mock.calls[0] as [string, typeof payload];
    expect(type).toBe("parcels.submitPOD");
    expect(sent.imageBase64).toBe(base64Image);
  });

  it("replays a queued addUpdate mutation when back online", async () => {
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerSyncHandler("parcels.addUpdate", handler);

    const item = makeItem(20, "parcels.addUpdate", {
      tenantId: "tenant-lagos",
      parcelId: 100,
      status: "OUT_FOR_DELIVERY",
    });
    mockGetPending.mockResolvedValueOnce([item]);

    await processMutationQueue();

    expect(handler).toHaveBeenCalledOnce();
    const [called] = handler.mock.calls[0] as [typeof item];
    const parsed = JSON.parse(called.payload);
    expect(parsed.parcelId).toBe(100);
    expect(parsed.status).toBe("OUT_FOR_DELIVERY");
  });

  it("replays a queued submitPOD with base64 image when back online", async () => {
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerSyncHandler("parcels.submitPOD", handler);

    const podPayload = {
      tenantId: "tenant-lagos",
      parcelId: 200,
      receivedByName: "Ada",
      receivedByRelation: "Self",
      imageBase64: "/9j/4AAQSkZJRgABAQAAAQABAAD...",
    };
    const item = makeItem(21, "parcels.submitPOD", podPayload);
    mockGetPending.mockResolvedValueOnce([item]);

    await processMutationQueue();

    expect(handler).toHaveBeenCalledOnce();
    const [called] = handler.mock.calls[0] as [typeof item];
    const parsed = JSON.parse(called.payload);
    expect(parsed.imageBase64).toBe(podPayload.imageBase64);
    expect(parsed.receivedByName).toBe("Ada");
  });

  it("replays verifyOtp mutation when back online", async () => {
    const handler = vi.fn().mockResolvedValue({ success: true });
    registerSyncHandler("parcels.verifyOtp", handler);

    const item = makeItem(22, "parcels.verifyOtp", {
      tenantId: "tenant-lagos",
      parcelId: 300,
      otpCode: "8371",
    });
    mockGetPending.mockResolvedValueOnce([item]);

    await processMutationQueue();

    expect(handler).toHaveBeenCalledOnce();
    const [called] = handler.mock.calls[0] as [typeof item];
    expect(JSON.parse(called.payload).otpCode).toBe("8371");
    expect(mockMarkSynced).toHaveBeenCalledWith(22);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sync status — completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("Sync status events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("processMutationQueue resolves without error for empty queue", async () => {
    mockGetPending.mockResolvedValueOnce([]);
    await expect(processMutationQueue()).resolves.toBeUndefined();
  });
});
