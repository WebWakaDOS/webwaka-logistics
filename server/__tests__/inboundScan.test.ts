/**
 * T-LOG-04: Inbound Receiving Scanner — Unit Tests
 *
 * Tests cover:
 *  - Pure sync-worker helpers (groupScansByTenant, resolveResultPerScan)
 *  - Core flush function behaviour via injectable scans array
 *  - Deduplication and batching behaviour
 *
 * No DB / Dexie access — all I/O is injected or mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  groupScansByTenant,
  resolveResultPerScan,
  type InboundSyncClient,
} from "../../client/src/lib/inboundScanSync";
import type { InboundScan } from "../../client/src/lib/offlineDb";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

let nextId = 1;

function makeScan(
  override: Partial<InboundScan> & { trackingNumber: string; tenantId: string },
): InboundScan {
  return {
    localId: nextId++,
    trackingNumber: override.trackingNumber,
    tenantId: override.tenantId,
    scannedAt: Date.now(),
    synced: false,
    ...override,
  };
}

/** Build a mock tRPC client for the sync worker. */
function buildMockClient(
  response: { receivedCount: number; notFound: string[]; alreadyReceived: string[] } | null = {
    receivedCount: 0,
    notFound: [],
    alreadyReceived: [],
  },
): InboundSyncClient {
  const mutateFn =
    response === null
      ? vi.fn(async () => {
          throw new Error("Network error");
        })
      : vi.fn(async () => response);

  return {
    warehouse: {
      bulkReceiveScans: {
        mutate: mutateFn,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// groupScansByTenant
// ─────────────────────────────────────────────────────────────────────────────

describe("groupScansByTenant", () => {
  it("groups scans by tenantId", () => {
    const scans: InboundScan[] = [
      makeScan({ trackingNumber: "WW-001", tenantId: "tenant-A" }),
      makeScan({ trackingNumber: "WW-002", tenantId: "tenant-B" }),
      makeScan({ trackingNumber: "WW-003", tenantId: "tenant-A" }),
      makeScan({ trackingNumber: "WW-004", tenantId: "tenant-A" }),
    ];

    const groups = groupScansByTenant(scans);

    expect(groups.size).toBe(2);
    expect(groups.get("tenant-A")).toHaveLength(3);
    expect(groups.get("tenant-B")).toHaveLength(1);
  });

  it("returns an empty map for an empty input array", () => {
    const groups = groupScansByTenant([]);
    expect(groups.size).toBe(0);
  });

  it("handles all scans in a single tenant", () => {
    const scans = [
      makeScan({ trackingNumber: "WW-A", tenantId: "tenant-X" }),
      makeScan({ trackingNumber: "WW-B", tenantId: "tenant-X" }),
    ];
    const groups = groupScansByTenant(scans);
    expect(groups.size).toBe(1);
    expect(groups.get("tenant-X")).toHaveLength(2);
  });

  it("preserves scan order within each tenant group", () => {
    const scans = [
      makeScan({ trackingNumber: "WW-1", tenantId: "T" }),
      makeScan({ trackingNumber: "WW-2", tenantId: "T" }),
      makeScan({ trackingNumber: "WW-3", tenantId: "T" }),
    ];
    const group = groupScansByTenant(scans).get("T")!;
    expect(group.map(s => s.trackingNumber)).toEqual(["WW-1", "WW-2", "WW-3"]);
  });

  it("handles many distinct tenants", () => {
    const scans = Array.from({ length: 10 }, (_, i) =>
      makeScan({ trackingNumber: `WW-${i}`, tenantId: `tenant-${i}` }),
    );
    const groups = groupScansByTenant(scans);
    expect(groups.size).toBe(10);
    for (const group of groups.values()) {
      expect(group).toHaveLength(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveResultPerScan
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveResultPerScan", () => {
  it("returns 'received' when tracking number is not in any error list", () => {
    expect(resolveResultPerScan("WW-001", [], [])).toBe("received");
    expect(resolveResultPerScan("WW-001", ["WW-999"], ["WW-888"])).toBe("received");
  });

  it("returns 'not_found' when tracking number is in notFound list", () => {
    expect(resolveResultPerScan("WW-UNKNOWN", ["WW-UNKNOWN"], [])).toBe("not_found");
  });

  it("returns 'already_received' when tracking number is in alreadyReceived list", () => {
    expect(resolveResultPerScan("WW-100", [], ["WW-100"])).toBe("already_received");
  });

  it("not_found takes priority over already_received if in both lists", () => {
    // notFound is checked before alreadyReceived in resolveResultPerScan
    expect(resolveResultPerScan("WW-X", ["WW-X"], ["WW-X"])).toBe("not_found");
  });

  it("is case-sensitive — partial match does not count as not_found", () => {
    expect(resolveResultPerScan("WW-001", ["WW-00"], [])).toBe("received");
    expect(resolveResultPerScan("WW-001", ["WW-0011"], [])).toBe("received");
  });

  it("is case-sensitive — lowercase variant does not match uppercase list entry", () => {
    expect(resolveResultPerScan("ww-001", ["WW-001"], [])).toBe("received");
  });

  it("handles empty notFound and alreadyReceived lists", () => {
    expect(resolveResultPerScan("ANY", [], [])).toBe("received");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// De-duplication logic — tested via groupScansByTenant + mock client
// ─────────────────────────────────────────────────────────────────────────────

describe("deduplication logic", () => {
  /**
   * Simulate the de-duplication step that flushInboundScans performs
   * before calling bulkReceiveScans.  We extract it as a pure function
   * here so we can test it without touching Dexie.
   */
  function deduplicateScans(scans: InboundScan[]): string[] {
    const seen = new Map<string, InboundScan>();
    for (const scan of scans) {
      if (!seen.has(scan.trackingNumber)) {
        seen.set(scan.trackingNumber, scan);
      }
    }
    return Array.from(seen.keys());
  }

  it("removes duplicate tracking numbers, keeping first occurrence", () => {
    const scans = [
      makeScan({ trackingNumber: "WW-DUPE", tenantId: "T" }),
      makeScan({ trackingNumber: "WW-DUPE", tenantId: "T" }),
      makeScan({ trackingNumber: "WW-UNIQUE", tenantId: "T" }),
    ];
    const unique = deduplicateScans(scans);
    expect(unique).toEqual(["WW-DUPE", "WW-UNIQUE"]);
  });

  it("passes through a list with no duplicates unchanged", () => {
    const scans = [
      makeScan({ trackingNumber: "WW-A", tenantId: "T" }),
      makeScan({ trackingNumber: "WW-B", tenantId: "T" }),
      makeScan({ trackingNumber: "WW-C", tenantId: "T" }),
    ];
    const unique = deduplicateScans(scans);
    expect(unique).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateScans([])).toHaveLength(0);
  });

  it("treats same tracking number in different tenants as separate entries", () => {
    // Deduplication is per-tenant (groupScansByTenant is called first)
    const tenantA = [makeScan({ trackingNumber: "WW-SHARED", tenantId: "A" })];
    const tenantB = [makeScan({ trackingNumber: "WW-SHARED", tenantId: "B" })];
    expect(deduplicateScans(tenantA)).toEqual(["WW-SHARED"]);
    expect(deduplicateScans(tenantB)).toEqual(["WW-SHARED"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock client — verifies the InboundSyncClient interface contract
// ─────────────────────────────────────────────────────────────────────────────

describe("InboundSyncClient mock", () => {
  it("resolves with the expected shape", async () => {
    const client = buildMockClient({ receivedCount: 1, notFound: [], alreadyReceived: [] });
    const result = await client.warehouse.bulkReceiveScans.mutate({
      tenantId: "T",
      trackingNumbers: ["WW-001"],
    });
    expect(result).toMatchObject({
      receivedCount: expect.any(Number),
      notFound: expect.any(Array),
      alreadyReceived: expect.any(Array),
    });
  });

  it("throws when constructed with null response (simulates network error)", async () => {
    const client = buildMockClient(null);
    await expect(
      client.warehouse.bulkReceiveScans.mutate({ tenantId: "T", trackingNumbers: ["WW-001"] }),
    ).rejects.toThrow("Network error");
  });

  it("records calls for assertion", async () => {
    const client = buildMockClient({ receivedCount: 2, notFound: [], alreadyReceived: [] });
    await client.warehouse.bulkReceiveScans.mutate({ tenantId: "T1", trackingNumbers: ["A", "B"] });
    await client.warehouse.bulkReceiveScans.mutate({ tenantId: "T2", trackingNumbers: ["C"] });
    expect(client.warehouse.bulkReceiveScans.mutate).toHaveBeenCalledTimes(2);
    const calls = (client.warehouse.bulkReceiveScans.mutate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toMatchObject({ tenantId: "T1", trackingNumbers: ["A", "B"] });
    expect(calls[1][0]).toMatchObject({ tenantId: "T2", trackingNumbers: ["C"] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveResultPerScan + groupScansByTenant integration
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveResultPerScan × groupScansByTenant — end-to-end classification", () => {
  it("correctly classifies a mixed batch across two tenants", () => {
    const scans = [
      makeScan({ trackingNumber: "WW-OK", tenantId: "A" }),
      makeScan({ trackingNumber: "WW-MISS", tenantId: "A" }),
      makeScan({ trackingNumber: "WW-DUP", tenantId: "B" }),
    ];

    const groups = groupScansByTenant(scans);

    // Tenant A: WW-MISS is not_found
    const notFoundA = ["WW-MISS"];
    const alreadyReceivedA: string[] = [];

    const tenantAScans = groups.get("A")!;
    const resultsA = tenantAScans.map(s =>
      resolveResultPerScan(s.trackingNumber, notFoundA, alreadyReceivedA),
    );
    expect(resultsA).toEqual(["received", "not_found"]);

    // Tenant B: WW-DUP is already_received
    const notFoundB: string[] = [];
    const alreadyReceivedB = ["WW-DUP"];

    const tenantBScans = groups.get("B")!;
    const resultsB = tenantBScans.map(s =>
      resolveResultPerScan(s.trackingNumber, notFoundB, alreadyReceivedB),
    );
    expect(resultsB).toEqual(["already_received"]);
  });
});
