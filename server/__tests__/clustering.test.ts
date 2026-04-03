/**
 * T-LOG-03: Geospatial Clustering Algorithm — Unit Tests
 * Tests the pure clustering algorithm with mock coordinate and text data.
 * No DB access — algorithm is fully side-effect-free.
 */

import { describe, it, expect } from "vitest";
import {
  clusterParcels,
  coordBucketKey,
  textBucketKey,
  snapToGrid,
  computeCentroid,
  deriveCityLabel,
  indexToLabel,
  type ClusterableParcel,
} from "../clustering";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeParcel(
  override: Partial<ClusterableParcel> & { id: number },
): ClusterableParcel {
  return {
    trackingNumber: `WW-TEST-${override.id}`,
    recipientName: "Test Recipient",
    recipientAddress: "123 Test St",
    recipientCity: "Lagos",
    recipientState: "Lagos",
    priority: "STANDARD",
    weightGrams: 500,
    deliveryFeeKobo: 50000,
    assignedAgentId: null,
    status: "PENDING",
    recipientLat: null,
    recipientLng: null,
    ...override,
  };
}

// Lagos Island coordinates (approx)
const LAGOS_ISLAND_1 = makeParcel({ id: 1, recipientLat: 6.4539, recipientLng: 3.3947, recipientCity: "Lagos Island", recipientState: "Lagos" });
const LAGOS_ISLAND_2 = makeParcel({ id: 2, recipientLat: 6.4601, recipientLng: 3.3982, recipientCity: "Lagos Island", recipientState: "Lagos" });
const LAGOS_ISLAND_3 = makeParcel({ id: 3, recipientLat: 6.4558, recipientLng: 3.3960, recipientCity: "Lagos Island", recipientState: "Lagos" });

// Ikeja coordinates (about 20km from Lagos Island — different grid cell at 0.05°)
const IKEJA_1 = makeParcel({ id: 4, recipientLat: 6.6018, recipientLng: 3.3515, recipientCity: "Ikeja", recipientState: "Lagos" });
const IKEJA_2 = makeParcel({ id: 5, recipientLat: 6.6045, recipientLng: 3.3490, recipientCity: "Ikeja", recipientState: "Lagos" });

// Lekki (east of Lagos Island — another distinct cell)
const LEKKI_1 = makeParcel({ id: 6, recipientLat: 6.4698, recipientLng: 3.5852, recipientCity: "Lekki", recipientState: "Lagos" });

// Parcels WITHOUT coordinates — should fall back to text clustering
const ABUJA_NO_COORDS_1 = makeParcel({ id: 7, recipientCity: "Abuja", recipientState: "FCT" });
const ABUJA_NO_COORDS_2 = makeParcel({ id: 8, recipientCity: "Abuja", recipientState: "FCT" });
const PHC_NO_COORDS = makeParcel({ id: 9, recipientCity: "Port Harcourt", recipientState: "Rivers" });

// ─────────────────────────────────────────────────────────────────────────────
// snapToGrid
// ─────────────────────────────────────────────────────────────────────────────
describe("snapToGrid", () => {
  it("snaps a value to the nearest grid boundary", () => {
    expect(snapToGrid(6.4539, 0.05)).toBeCloseTo(6.45, 4);
    expect(snapToGrid(6.4760, 0.05)).toBeCloseTo(6.50, 4);
    expect(snapToGrid(6.4250, 0.05)).toBeCloseTo(6.45, 4);
  });

  it("returns exact grid boundary when input is exactly on boundary", () => {
    expect(snapToGrid(6.50, 0.05)).toBeCloseTo(6.50, 4);
    expect(snapToGrid(0.00, 0.05)).toBeCloseTo(0.00, 4);
  });

  it("handles negative coordinates (Southern Hemisphere)", () => {
    expect(snapToGrid(-6.45, 0.05)).toBeCloseTo(-6.45, 4);
    expect(snapToGrid(-6.47, 0.05)).toBeCloseTo(-6.45, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// coordBucketKey
// ─────────────────────────────────────────────────────────────────────────────
describe("coordBucketKey", () => {
  it("returns a coord: prefixed key for valid coordinates", () => {
    const key = coordBucketKey(6.4539, 3.3947);
    expect(key).toMatch(/^coord:/);
  });

  it("two coordinates in the same grid cell produce the same key", () => {
    const key1 = coordBucketKey(6.4539, 3.3947);
    const key2 = coordBucketKey(6.4601, 3.3982);
    expect(key1).toBe(key2);
  });

  it("coordinates in different grid cells produce different keys", () => {
    const key1 = coordBucketKey(6.4539, 3.3947); // Lagos Island
    const key2 = coordBucketKey(6.6018, 3.3515); // Ikeja
    expect(key1).not.toBe(key2);
  });

  it("returns null for null lat", () => {
    expect(coordBucketKey(null, 3.3947)).toBeNull();
  });

  it("returns null for null lng", () => {
    expect(coordBucketKey(6.45, null)).toBeNull();
  });

  it("returns null for undefined coordinates", () => {
    expect(coordBucketKey(undefined, undefined)).toBeNull();
  });

  it("returns null for out-of-range latitude", () => {
    expect(coordBucketKey(91, 3.39)).toBeNull();
    expect(coordBucketKey(-91, 3.39)).toBeNull();
  });

  it("returns null for out-of-range longitude", () => {
    expect(coordBucketKey(6.45, 181)).toBeNull();
    expect(coordBucketKey(6.45, -181)).toBeNull();
  });

  it("returns null for NaN coordinates", () => {
    expect(coordBucketKey(NaN, 3.39)).toBeNull();
    expect(coordBucketKey(6.45, NaN)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// textBucketKey
// ─────────────────────────────────────────────────────────────────────────────
describe("textBucketKey", () => {
  it("returns a text: prefixed key", () => {
    expect(textBucketKey("Lagos", "Lagos")).toMatch(/^text:/);
  });

  it("normalises case", () => {
    const k1 = textBucketKey("LAGOS", "LAGOS");
    const k2 = textBucketKey("lagos", "lagos");
    expect(k1).toBe(k2);
  });

  it("trims whitespace", () => {
    const k1 = textBucketKey("  Lagos  ", "  Lagos  ");
    const k2 = textBucketKey("Lagos", "Lagos");
    expect(k1).toBe(k2);
  });

  it("differentiates cities in different states", () => {
    const k1 = textBucketKey("Abuja", "FCT");
    const k2 = textBucketKey("Abuja", "Nasarawa");
    expect(k1).not.toBe(k2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCentroid
// ─────────────────────────────────────────────────────────────────────────────
describe("computeCentroid", () => {
  it("computes average lat/lng from parcels with coordinates", () => {
    const result = computeCentroid([LAGOS_ISLAND_1, LAGOS_ISLAND_2, LAGOS_ISLAND_3]);
    expect(result.lat).toBeCloseTo((6.4539 + 6.4601 + 6.4558) / 3, 3);
    expect(result.lng).toBeCloseTo((3.3947 + 3.3982 + 3.3960) / 3, 3);
  });

  it("returns null centroid when no parcels have coordinates", () => {
    const result = computeCentroid([ABUJA_NO_COORDS_1, ABUJA_NO_COORDS_2]);
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
  });

  it("ignores parcels without coordinates in centroid calculation", () => {
    const withCoord = makeParcel({ id: 99, recipientLat: 6.45, recipientLng: 3.39 });
    const noCoord = makeParcel({ id: 100, recipientLat: null, recipientLng: null });
    const result = computeCentroid([withCoord, noCoord]);
    expect(result.lat).toBeCloseTo(6.45, 4);
    expect(result.lng).toBeCloseTo(3.39, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveCityLabel
// ─────────────────────────────────────────────────────────────────────────────
describe("deriveCityLabel", () => {
  it("returns most frequent city+state label", () => {
    const parcels = [
      makeParcel({ id: 1, recipientCity: "Ikeja", recipientState: "Lagos" }),
      makeParcel({ id: 2, recipientCity: "Ikeja", recipientState: "Lagos" }),
      makeParcel({ id: 3, recipientCity: "Lagos Island", recipientState: "Lagos" }),
    ];
    expect(deriveCityLabel(parcels)).toBe("Ikeja, Lagos");
  });

  it("returns Unknown Area for empty array", () => {
    expect(deriveCityLabel([])).toBe("Unknown Area");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// indexToLabel
// ─────────────────────────────────────────────────────────────────────────────
describe("indexToLabel", () => {
  it("converts 0-25 to A-Z", () => {
    expect(indexToLabel(0)).toBe("A");
    expect(indexToLabel(25)).toBe("Z");
  });

  it("converts 26 to AA", () => {
    expect(indexToLabel(26)).toBe("AA");
  });

  it("converts 51 to AZ", () => {
    expect(indexToLabel(51)).toBe("AZ");
  });

  it("converts 52 to BA", () => {
    expect(indexToLabel(52)).toBe("BA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clusterParcels — integration scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe("clusterParcels", () => {
  it("returns empty array for empty input", () => {
    expect(clusterParcels([])).toEqual([]);
  });

  it("groups nearby coordinate parcels into the same cluster", () => {
    const clusters = clusterParcels([LAGOS_ISLAND_1, LAGOS_ISLAND_2, LAGOS_ISLAND_3]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].parcelCount).toBe(3);
    expect(clusters[0].strategy).toBe("coordinate");
  });

  it("separates parcels in different geographic zones", () => {
    const clusters = clusterParcels([
      LAGOS_ISLAND_1,
      LAGOS_ISLAND_2,
      IKEJA_1,
      IKEJA_2,
      LEKKI_1,
    ]);
    expect(clusters).toHaveLength(3);
  });

  it("sorts clusters by parcel count descending (largest first)", () => {
    const clusters = clusterParcels([
      LAGOS_ISLAND_1, LAGOS_ISLAND_2, LAGOS_ISLAND_3,
      IKEJA_1, IKEJA_2,
      LEKKI_1,
    ]);
    expect(clusters[0].parcelCount).toBeGreaterThanOrEqual(clusters[1].parcelCount);
    expect(clusters[1].parcelCount).toBeGreaterThanOrEqual(clusters[2].parcelCount);
  });

  it("falls back to text clustering for parcels without coordinates", () => {
    const clusters = clusterParcels([ABUJA_NO_COORDS_1, ABUJA_NO_COORDS_2, PHC_NO_COORDS]);
    expect(clusters).toHaveLength(2);
    const abujaCluster = clusters.find(c => c.label.includes("Abuja"));
    expect(abujaCluster).toBeDefined();
    expect(abujaCluster!.parcelCount).toBe(2);
    expect(abujaCluster!.strategy).toBe("text");
    expect(abujaCluster!.centroid.lat).toBeNull();
  });

  it("handles mixed coordinate and text parcels", () => {
    const clusters = clusterParcels([
      LAGOS_ISLAND_1,
      LAGOS_ISLAND_2,
      ABUJA_NO_COORDS_1,
      PHC_NO_COORDS,
    ]);
    // Lagos Island (coord), Abuja (text), PHC (text) = 3 clusters
    expect(clusters).toHaveLength(3);
    const coordCluster = clusters.find(c => c.strategy === "coordinate");
    expect(coordCluster).toBeDefined();
    expect(coordCluster!.centroid.lat).not.toBeNull();
  });

  it("assigns short labels A, B, C, … to clusters", () => {
    const clusters = clusterParcels([
      LAGOS_ISLAND_1, LAGOS_ISLAND_2,
      IKEJA_1,
    ]);
    const labels = clusters.map(c => c.shortLabel);
    expect(labels[0]).toBe("A");
    expect(labels[1]).toBe("B");
  });

  it("accumulates totalFeeKobo and totalWeightGrams correctly", () => {
    const p1 = makeParcel({ id: 10, recipientLat: 6.45, recipientLng: 3.39, deliveryFeeKobo: 10000, weightGrams: 300 });
    const p2 = makeParcel({ id: 11, recipientLat: 6.46, recipientLng: 3.40, deliveryFeeKobo: 20000, weightGrams: 700 });
    const clusters = clusterParcels([p1, p2]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].totalFeeKobo).toBe(30000);
    expect(clusters[0].totalWeightGrams).toBe(1000);
  });

  it("uses custom precision parameter", () => {
    // With 0.5° precision, Lagos Island and Ikeja (~0.15° apart) should merge
    const clusters = clusterParcels([LAGOS_ISLAND_1, IKEJA_1], 0.5);
    expect(clusters).toHaveLength(1);
  });

  it("each cluster contains references to original parcel objects", () => {
    const clusters = clusterParcels([LAGOS_ISLAND_1, LAGOS_ISLAND_2]);
    const clusterParcelIds = clusters[0].parcels.map(p => p.id);
    expect(clusterParcelIds).toContain(1);
    expect(clusterParcelIds).toContain(2);
  });

  it("single parcel forms its own cluster", () => {
    const clusters = clusterParcels([LEKKI_1]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].parcelCount).toBe(1);
    expect(clusters[0].parcels[0].id).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant isolation (algorithm-level)
// ─────────────────────────────────────────────────────────────────────────────
describe("multi-tenant isolation", () => {
  it("clustering operates only on the parcels passed in — caller must pre-scope by tenantId", () => {
    // This test verifies the algorithm doesn't mix data from different tenants
    // Tenant isolation is enforced by getUnassignedParcels(tenantId) in dispatch.db.ts;
    // the algorithm itself just processes whatever array is passed.
    const tenantAParcels = [
      makeParcel({ id: 100, recipientCity: "Lagos", recipientState: "Lagos" }),
    ];
    const tenantBParcels = [
      makeParcel({ id: 200, recipientCity: "Lagos", recipientState: "Lagos" }),
    ];

    // Each tenant's parcels are clustered in complete isolation
    const tenantAClusters = clusterParcels(tenantAParcels);
    const tenantBClusters = clusterParcels(tenantBParcels);

    expect(tenantAClusters[0].parcels).toHaveLength(1);
    expect(tenantAClusters[0].parcels[0].id).toBe(100);

    expect(tenantBClusters[0].parcels).toHaveLength(1);
    expect(tenantBClusters[0].parcels[0].id).toBe(200);
  });
});
