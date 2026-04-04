/**
 * QA-LOG-2: GET /api/deliveries/:id/pod — REST Endpoint Tests
 * Covers: auth enforcement, RBAC (driver isolation), POD retrieval,
 * tenant scoping, error handling.
 *
 * Uses mocked SDK auth, parcels DB helpers, and a lightweight express test app.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Application } from "express";
import request from "supertest";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must appear before imports that use them
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("../parcels.db", () => ({
  getProofOfDelivery: vi.fn(),
  getParcelById: vi.fn(),
}));

vi.mock("../logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { sdk } from "../_core/sdk";
import { getProofOfDelivery, getParcelById } from "../parcels.db";

const mockAuth = vi.mocked(sdk.authenticateRequest);
const mockGetPod = vi.mocked(getProofOfDelivery);
const mockGetParcel = vi.mocked(getParcelById);

// ─────────────────────────────────────────────────────────────────────────────
// Build an isolated Express app that mirrors the server endpoint
// (extracted from startServer() so we can test it without spinning up the full server)
// ─────────────────────────────────────────────────────────────────────────────

function buildTestApp(): Application {
  const app = express();
  app.use(express.json());

  app.get("/api/deliveries/:id/pod", async (req, res) => {
    let user: Record<string, unknown> | null = null;
    try {
      user = await sdk.authenticateRequest(req as never) as Record<string, unknown>;
    } catch {
      res.status(401).json({ success: false, error: "Unauthorized — valid session required" });
      return;
    }

    const parcelId = parseInt(req.params.id, 10);
    if (isNaN(parcelId) || parcelId <= 0) {
      res.status(400).json({ success: false, error: "Invalid parcel ID" });
      return;
    }

    const tenantId =
      (req.headers["x-tenant-id"] as string | undefined) ??
      (user.tenantId as string | undefined) ??
      "";

    if (!tenantId) {
      res.status(400).json({ success: false, error: "Missing tenant context — include X-Tenant-Id header" });
      return;
    }

    try {
      const parcel = await getParcelById(tenantId, parcelId) as Record<string, unknown> | null;
      if (!parcel) {
        res.status(404).json({ success: false, error: "Delivery not found" });
        return;
      }

      const isAgent = (user.role as string) === "agent";
      const isAdmin = (user.role as string) === "admin";
      if (isAgent && !isAdmin && parcel.assignedAgentId !== user.id) {
        res.status(403).json({ success: false, error: "Forbidden — this delivery is not assigned to you" });
        return;
      }

      const pod = await getProofOfDelivery(tenantId, parcelId) as Record<string, unknown> | null;
      if (!pod) {
        res.status(404).json({ success: false, error: "No proof of delivery found for this delivery" });
        return;
      }

      res.json({
        success: true,
        data: {
          id: pod.id,
          parcelId: pod.parcelId,
          trackingNumber: parcel.trackingNumber,
          imageUrl: pod.imageUrl ?? null,
          signatureUrl: pod.signatureUrl ?? null,
          receivedByName: pod.receivedByName,
          receivedByRelation: pod.receivedByRelation,
          createdAt: pod.createdAt,
        },
      });
    } catch {
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_USER = { id: 1, role: "admin", tenantId: "tenant-lagos" };
const AGENT_USER = { id: 10, role: "agent", tenantId: "tenant-lagos" };
const OTHER_AGENT = { id: 20, role: "agent", tenantId: "tenant-lagos" };

const PARCEL = {
  id: 42,
  trackingNumber: "WW-20260404-TEST1",
  tenantId: "tenant-lagos",
  assignedAgentId: 10,
  status: "DELIVERED",
};

const POD_RECORD = {
  id: 1,
  parcelId: 42,
  tenantId: "tenant-lagos",
  imageUrl: "https://r2.example.com/pod/42.jpg",
  signatureUrl: null,
  receivedByName: "Adaeze Okonkwo",
  receivedByRelation: "Self",
  createdAt: new Date("2026-04-04T12:00:00Z"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/deliveries/:id/pod", () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildTestApp();
  });

  // ── Authentication ─────────────────────────────────────────────────────────

  it("returns 401 when no session cookie is provided", async () => {
    mockAuth.mockRejectedValueOnce(new Error("Missing session"));

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Unauthorized");
  });

  it("returns 400 for an invalid (non-numeric) parcel ID", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);

    const res = await request(app)
      .get("/api/deliveries/not-a-number/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid parcel ID");
  });

  it("returns 400 for a zero parcel ID", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);

    const res = await request(app)
      .get("/api/deliveries/0/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid parcel ID");
  });

  it("returns 400 when no tenant ID is provided", async () => {
    mockAuth.mockResolvedValueOnce({ id: 1, role: "admin" } as never);

    const res = await request(app).get("/api/deliveries/42/pod");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing tenant context");
  });

  // ── Delivery not found ─────────────────────────────────────────────────────

  it("returns 404 when the parcel does not exist in this tenant", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);
    mockGetParcel.mockResolvedValueOnce(null as never);

    const res = await request(app)
      .get("/api/deliveries/9999/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Delivery not found");
  });

  it("returns 404 when the parcel exists but has no POD record yet", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);
    mockGetParcel.mockResolvedValueOnce(PARCEL as never);
    mockGetPod.mockResolvedValueOnce(null as never);

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No proof of delivery found");
  });

  // ── RBAC enforcement ───────────────────────────────────────────────────────

  it("returns 403 when an agent requests a delivery assigned to a different agent", async () => {
    mockAuth.mockResolvedValueOnce(OTHER_AGENT as never);
    mockGetParcel.mockResolvedValueOnce(PARCEL as never); // assignedAgentId: 10, user.id: 20

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden");
    expect(res.body.error).toContain("not assigned to you");
  });

  it("allows an agent to retrieve POD for their own delivery", async () => {
    mockAuth.mockResolvedValueOnce(AGENT_USER as never); // id: 10, assignedAgentId: 10
    mockGetParcel.mockResolvedValueOnce(PARCEL as never);
    mockGetPod.mockResolvedValueOnce(POD_RECORD as never);

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.receivedByName).toBe("Adaeze Okonkwo");
  });

  it("allows an admin to retrieve any delivery's POD", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);
    mockGetParcel.mockResolvedValueOnce({ ...PARCEL, assignedAgentId: 999 } as never);
    mockGetPod.mockResolvedValueOnce(POD_RECORD as never);

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── Successful response shape ──────────────────────────────────────────────

  it("returns correct POD data shape on successful retrieval", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);
    mockGetParcel.mockResolvedValueOnce(PARCEL as never);
    mockGetPod.mockResolvedValueOnce(POD_RECORD as never);

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        id: 1,
        parcelId: 42,
        trackingNumber: "WW-20260404-TEST1",
        imageUrl: "https://r2.example.com/pod/42.jpg",
        signatureUrl: null,
        receivedByName: "Adaeze Okonkwo",
        receivedByRelation: "Self",
      },
    });
  });

  it("tenant ID from X-Tenant-Id header is used to scope the query", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);
    mockGetParcel.mockResolvedValueOnce(PARCEL as never);
    mockGetPod.mockResolvedValueOnce(POD_RECORD as never);

    await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(mockGetParcel).toHaveBeenCalledWith("tenant-lagos", 42);
    expect(mockGetPod).toHaveBeenCalledWith("tenant-lagos", 42);
  });

  it("returns 500 when the database throws unexpectedly", async () => {
    mockAuth.mockResolvedValueOnce(ADMIN_USER as never);
    mockGetParcel.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await request(app)
      .get("/api/deliveries/42/pod")
      .set("X-Tenant-Id", "tenant-lagos");

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
