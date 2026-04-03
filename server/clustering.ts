/**
 * T-LOG-03: Geospatial Order Clustering Algorithm
 * ─────────────────────────────────────────────────
 * Groups unassigned parcels by geographic proximity without PostGIS.
 * Compatible with SQLite/D1 — all computation is pure TypeScript.
 *
 * Strategy:
 *  1. Coordinate-based (preferred): Round lat/lng to a 0.05° grid (~5.5 km cells).
 *     All parcels in the same grid cell form a cluster. Grid granularity is tuned
 *     for Nigerian urban dispatch (Lagos, Abuja, PHC traffic zones).
 *  2. Text-based fallback: Parcels without geocoded coordinates are grouped by
 *     normalised recipientCity + recipientState string.
 *
 * WebWaka Invariants:
 *  - Multi-tenant: tenantId isolation is enforced BEFORE clustering (DB query scope).
 *  - D1 / SQLite safe: no PostGIS, no extensions — pure arithmetic + string ops.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal parcel shape required by the clusterer */
export interface ClusterableParcel {
  id: number;
  trackingNumber: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState: string;
  recipientLat?: number | null;
  recipientLng?: number | null;
  priority: string;
  weightGrams: number;
  deliveryFeeKobo: number;
  assignedAgentId?: number | null;
  status: string;
}

export type ClusterStrategy = "coordinate" | "text";

export interface ParcelCluster {
  /** Internal bucket key — not shown in UI */
  key: string;
  /** Human-readable cluster name, e.g. "Lagos Island" or "Ikeja, Lagos" */
  label: string;
  /** Short letter label for display, e.g. "A", "B" */
  shortLabel: string;
  strategy: ClusterStrategy;
  /** Geographic centroid of the cluster (null if text-only cluster) */
  centroid: { lat: number | null; lng: number | null };
  parcels: ClusterableParcel[];
  parcelCount: number;
  /** Sum of all delivery fees in the cluster (kobo) */
  totalFeeKobo: number;
  /** Sum of all weights in the cluster (grams) */
  totalWeightGrams: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grid precision in degrees.
 * 0.05° ≈ 5.5 km at the equator — suitable for intra-city dispatch zones.
 * Use 0.1° for inter-city (≈11 km) or 0.02° for hyper-local (≈2.2 km).
 */
const GRID_PRECISION = 0.05;

// ─────────────────────────────────────────────────────────────────────────────
// Core algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snap a coordinate to the nearest grid cell boundary.
 * E.g. 6.4534 → 6.45 with precision 0.05
 */
export function snapToGrid(value: number, precision: number = GRID_PRECISION): number {
  return Math.round(value / precision) * precision;
}

/**
 * Build a coordinate-based bucket key for a parcel.
 * Returns null if coordinates are missing or invalid.
 */
export function coordBucketKey(
  lat: number | null | undefined,
  lng: number | null | undefined,
  precision: number = GRID_PRECISION,
): string | null {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const snappedLat = snapToGrid(lat, precision);
  const snappedLng = snapToGrid(lng, precision);
  return `coord:${snappedLat.toFixed(4)},${snappedLng.toFixed(4)}`;
}

/**
 * Build a text-based bucket key from city + state.
 * Normalised to lowercase with whitespace collapsed.
 */
export function textBucketKey(city: string, state: string): string {
  const normCity = city.toLowerCase().trim().replace(/\s+/g, " ");
  const normState = state.toLowerCase().trim().replace(/\s+/g, " ");
  return `text:${normCity}|${normState}`;
}

/**
 * Compute the geographic centroid of a set of parcels.
 * Returns null centroid if no coordinates are available.
 */
export function computeCentroid(
  parcels: ClusterableParcel[],
): { lat: number | null; lng: number | null } {
  const coordParcels = parcels.filter(
    p => p.recipientLat != null && p.recipientLng != null,
  );
  if (coordParcels.length === 0) return { lat: null, lng: null };
  const lat =
    coordParcels.reduce((sum, p) => sum + p.recipientLat!, 0) / coordParcels.length;
  const lng =
    coordParcels.reduce((sum, p) => sum + p.recipientLng!, 0) / coordParcels.length;
  return { lat, lng };
}

/**
 * Derive a human-readable label from a cluster's parcels.
 * Uses the most frequent city name as the primary label.
 */
export function deriveCityLabel(parcels: ClusterableParcel[]): string {
  const freq: Record<string, number> = {};
  for (const p of parcels) {
    const key = `${p.recipientCity}, ${p.recipientState}`;
    freq[key] = (freq[key] ?? 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : "Unknown Area";
}

/**
 * Convert a 0-based cluster index to a short alphabetic label.
 * 0 → "A", 25 → "Z", 26 → "AA", etc.
 */
export function indexToLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Main clustering function.
 *
 * @param parcels - Unassigned parcels to cluster (already tenant-scoped by caller).
 * @param precision - Grid precision in degrees (default: GRID_PRECISION = 0.05).
 * @returns Clusters sorted by parcel count descending.
 */
export function clusterParcels(
  parcels: ClusterableParcel[],
  precision: number = GRID_PRECISION,
): ParcelCluster[] {
  const buckets = new Map<string, { strategy: ClusterStrategy; parcels: ClusterableParcel[] }>();

  for (const parcel of parcels) {
    const coordKey = coordBucketKey(parcel.recipientLat, parcel.recipientLng, precision);

    if (coordKey) {
      const existing = buckets.get(coordKey);
      if (existing) {
        existing.parcels.push(parcel);
      } else {
        buckets.set(coordKey, { strategy: "coordinate", parcels: [parcel] });
      }
    } else {
      const txtKey = textBucketKey(parcel.recipientCity, parcel.recipientState);
      const existing = buckets.get(txtKey);
      if (existing) {
        existing.parcels.push(parcel);
      } else {
        buckets.set(txtKey, { strategy: "text", parcels: [parcel] });
      }
    }
  }

  // Convert map to sorted cluster array
  const unsorted: Omit<ParcelCluster, "shortLabel">[] = [];
  for (const [key, { strategy, parcels: clusterParcels }] of buckets.entries()) {
    const centroid = computeCentroid(clusterParcels);
    const label = deriveCityLabel(clusterParcels);
    const totalFeeKobo = clusterParcels.reduce((s, p) => s + p.deliveryFeeKobo, 0);
    const totalWeightGrams = clusterParcels.reduce((s, p) => s + p.weightGrams, 0);

    unsorted.push({
      key,
      label,
      strategy,
      centroid,
      parcels: clusterParcels,
      parcelCount: clusterParcels.length,
      totalFeeKobo,
      totalWeightGrams,
    });
  }

  // Sort by parcel count descending (largest cluster first = most urgent dispatch)
  unsorted.sort((a, b) => b.parcelCount - a.parcelCount);

  // Assign short labels
  return unsorted.map((cluster, i) => ({
    ...cluster,
    shortLabel: indexToLabel(i),
  }));
}
