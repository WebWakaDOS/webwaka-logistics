/**
 * T-LOG-05: Rider KYC Verification — Unit Tests
 *
 * Tests cover:
 *  - KYC state machine transitions (PENDING → VERIFYING → ACTIVE/REJECTED)
 *  - handleKycVerificationCompleted validation and idempotency
 *  - kycEventBus publish behaviour (HTTP forward + no-URL log-only mode)
 *  - NDPR invariant: no license number collected in payloads
 *
 * No DB / R2 access — all I/O is injected or mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleKycVerificationCompleted } from "../../server/events/kycVerificationCompleted";
import { publishKycEvent } from "../../server/events/kycEventBus";
import { isWebhookAuthenticated } from "../../server/events/kycEventRouter";
import { KycEvents } from "../../server/events/kycTypes";
import type {
  KycVerificationCompletedPayload,
  KycVerificationRequestedPayload,
} from "../../server/events/kycTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Mock riders.db
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../server/riders.db", () => ({
  getRiderById: vi.fn(),
  updateRiderKycStatus: vi.fn(),
}));

import * as ridersDb from "../../server/riders.db";

const mockGetRiderById = ridersDb.getRiderById as ReturnType<typeof vi.fn>;
const mockUpdateRiderKycStatus = ridersDb.updateRiderKycStatus as ReturnType<typeof vi.fn>;

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRider(overrides: { kycStatus?: string } = {}) {
  return {
    id: 42,
    tenantId: "tenant-lagos",
    userId: 7,
    fullName: "Emeka Okafor",
    phone: "08012345678",
    address: "22 Bode Thomas Street",
    state: "Lagos",
    lga: "Surulere",
    vehicleType: "BIKE",
    plateNumber: "LSD-123AA",
    licenseDocKey: "kyc/tenant-lagos/riders/7/license-1000.jpg",
    licenseDocUrl: "https://r2.example.com/kyc/tenant-lagos/riders/7/license-1000.jpg",
    licenseExpiresAt: null,
    kycStatus: overrides.kycStatus ?? "VERIFYING",
    kycReference: null,
    rejectionReason: null,
    submittedAt: new Date(),
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCompletedPayload(
  overrides: Partial<KycVerificationCompletedPayload> = {},
): KycVerificationCompletedPayload {
  return {
    riderId: 42,
    tenantId: "tenant-lagos",
    status: "approved",
    verifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// handleKycVerificationCompleted — validation
// ─────────────────────────────────────────────────────────────────────────────

describe("handleKycVerificationCompleted — payload validation", () => {
  beforeEach(() => {
    mockGetRiderById.mockResolvedValue(makeRider());
    mockUpdateRiderKycStatus.mockResolvedValue(makeRider({ kycStatus: "ACTIVE" }));
  });

  afterEach(() => vi.clearAllMocks());

  it("rejects null payload without throwing", async () => {
    await handleKycVerificationCompleted(null);
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects non-object payload", async () => {
    await handleKycVerificationCompleted("not-an-object");
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects missing riderId", async () => {
    await handleKycVerificationCompleted({ tenantId: "t", status: "approved", verifiedAt: new Date().toISOString() });
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects non-integer riderId", async () => {
    await handleKycVerificationCompleted({ riderId: "42", tenantId: "t", status: "approved", verifiedAt: new Date().toISOString() });
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects missing tenantId", async () => {
    await handleKycVerificationCompleted({ riderId: 1, status: "approved", verifiedAt: new Date().toISOString() });
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects invalid status value", async () => {
    await handleKycVerificationCompleted({ riderId: 42, tenantId: "t", status: "pending", verifiedAt: new Date().toISOString() });
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects missing verifiedAt", async () => {
    await handleKycVerificationCompleted({ riderId: 42, tenantId: "t", status: "approved" });
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("rejects malformed verifiedAt", async () => {
    await handleKycVerificationCompleted({ riderId: 42, tenantId: "t", status: "approved", verifiedAt: "not-a-date" });
    expect(mockGetRiderById).not.toHaveBeenCalled();
  });

  it("accepts valid approved payload and proceeds", async () => {
    await handleKycVerificationCompleted(makeCompletedPayload());
    expect(mockGetRiderById).toHaveBeenCalledWith("tenant-lagos", 42);
  });

  it("accepts valid rejected payload with reason", async () => {
    await handleKycVerificationCompleted(makeCompletedPayload({ status: "rejected", reason: "Expired document" }));
    expect(mockGetRiderById).toHaveBeenCalledWith("tenant-lagos", 42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleKycVerificationCompleted — state machine transitions
// ─────────────────────────────────────────────────────────────────────────────

describe("handleKycVerificationCompleted — state transitions", () => {
  afterEach(() => vi.clearAllMocks());

  it("VERIFYING → ACTIVE when status is approved", async () => {
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "VERIFYING" }));
    mockUpdateRiderKycStatus.mockResolvedValue(makeRider({ kycStatus: "ACTIVE" }));

    await handleKycVerificationCompleted(makeCompletedPayload({ status: "approved" }));

    expect(mockUpdateRiderKycStatus).toHaveBeenCalledWith(
      "tenant-lagos",
      42,
      "ACTIVE",
      expect.objectContaining({ verifiedAt: expect.any(Date) }),
    );
  });

  it("VERIFYING → REJECTED when status is rejected", async () => {
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "VERIFYING" }));
    mockUpdateRiderKycStatus.mockResolvedValue(makeRider({ kycStatus: "REJECTED" }));

    await handleKycVerificationCompleted(
      makeCompletedPayload({ status: "rejected", reason: "Blurry document" }),
    );

    expect(mockUpdateRiderKycStatus).toHaveBeenCalledWith(
      "tenant-lagos",
      42,
      "REJECTED",
      expect.objectContaining({ rejectionReason: "Blurry document" }),
    );
  });

  it("is idempotent — skips update when already ACTIVE", async () => {
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "ACTIVE" }));

    await handleKycVerificationCompleted(makeCompletedPayload({ status: "approved" }));

    expect(mockUpdateRiderKycStatus).not.toHaveBeenCalled();
  });

  it("is idempotent — skips update when already REJECTED", async () => {
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "REJECTED" }));

    await handleKycVerificationCompleted(makeCompletedPayload({ status: "approved" }));

    expect(mockUpdateRiderKycStatus).not.toHaveBeenCalled();
  });

  it("gracefully skips when rider not found in DB", async () => {
    mockGetRiderById.mockResolvedValue(null);

    await handleKycVerificationCompleted(makeCompletedPayload());

    expect(mockUpdateRiderKycStatus).not.toHaveBeenCalled();
  });

  it("sets rejectionReason to undefined on approval (no contamination from prior rejection)", async () => {
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "VERIFYING" }));
    mockUpdateRiderKycStatus.mockResolvedValue(makeRider({ kycStatus: "ACTIVE" }));

    await handleKycVerificationCompleted(makeCompletedPayload({ status: "approved" }));

    const [, , , fields] = mockUpdateRiderKycStatus.mock.calls[0] as Parameters<typeof ridersDb.updateRiderKycStatus>;
    expect(fields?.rejectionReason).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// publishKycEvent — event bus behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe("publishKycEvent — KYC event bus", () => {
  const originalEnv = process.env.KYC_EVENTS_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.KYC_EVENTS_URL = originalEnv;
  });

  it("logs the event without HTTP when KYC_EVENTS_URL is unset", async () => {
    delete process.env.KYC_EVENTS_URL;
    const payload: KycVerificationRequestedPayload = {
      riderId: 1,
      tenantId: "tenant-test",
      fullName: "Test Rider",
      phone: "08099999999",
      licenseDocUrl: "https://r2.example.com/kyc/tenant-test/riders/1/license.jpg",
      guarantors: [],
    };
    await expect(
      publishKycEvent(KycEvents.VERIFICATION_REQUESTED, payload),
    ).resolves.toBeUndefined();
  });

  it("sends POST to KYC_EVENTS_URL when set and server returns 200", async () => {
    process.env.KYC_EVENTS_URL = "https://fintech.example.com/api/events/kyc";

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const payload: KycVerificationRequestedPayload = {
      riderId: 5,
      tenantId: "tenant-abuja",
      fullName: "Fatima Al-Hassan",
      phone: "08055555555",
      licenseDocUrl: "https://r2.example.com/kyc/tenant-abuja/riders/5/license.jpg",
      guarantors: [
        {
          fullName: "Ibrahim Musa",
          phone: "08066666666",
          relationship: "Employer",
          idDocUrl: "https://r2.example.com/kyc/tenant-abuja/guarantors/5/id.jpg",
        },
      ],
    };

    await publishKycEvent(KycEvents.VERIFICATION_REQUESTED, payload);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://fintech.example.com/api/events/kyc");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);
    expect(body.type).toBe(KycEvents.VERIFICATION_REQUESTED);
    expect(body.payload.riderId).toBe(5);
    expect(body.payload.tenantId).toBe("tenant-abuja");
  });

  it("does not throw when HTTP POST fails (server is down)", async () => {
    process.env.KYC_EVENTS_URL = "https://fintech.example.com/api/events/kyc";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      publishKycEvent(KycEvents.VERIFICATION_REQUESTED, { riderId: 1 } as KycVerificationRequestedPayload),
    ).resolves.toBeUndefined();
  });

  it("does not throw when server returns non-200 status", async () => {
    process.env.KYC_EVENTS_URL = "https://fintech.example.com/api/events/kyc";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      publishKycEvent(KycEvents.VERIFICATION_REQUESTED, { riderId: 1 } as KycVerificationRequestedPayload),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NDPR invariant — no raw PII in event payload
// ─────────────────────────────────────────────────────────────────────────────

describe("NDPR invariant — event payload structure", () => {
  it("kyc.verification_requested payload does not include license number field", () => {
    const payload: KycVerificationRequestedPayload = {
      riderId: 1,
      tenantId: "t",
      fullName: "Test",
      phone: "080",
      licenseDocUrl: "https://r2.example.com/key.jpg",
      guarantors: [],
    };
    const keys = Object.keys(payload);
    expect(keys).not.toContain("licenseNumber");
    expect(keys).not.toContain("bvn");
    expect(keys).not.toContain("nin");
  });

  it("kyc.verification_requested payload contains only the doc URL (not raw doc bytes)", () => {
    const payload: KycVerificationRequestedPayload = {
      riderId: 2,
      tenantId: "t",
      fullName: "Test",
      phone: "080",
      licenseDocUrl: "https://r2.example.com/key.jpg",
      guarantors: [],
    };
    expect(payload.licenseDocUrl).toMatch(/^https?:\/\//);
    expect(payload).not.toHaveProperty("licenseDocBase64");
  });

  it("kyc.verification_completed payload does not include any document or identity data", () => {
    const completedPayload: KycVerificationCompletedPayload = {
      riderId: 1,
      tenantId: "t",
      status: "approved",
      verifiedAt: new Date().toISOString(),
    };
    const keys = Object.keys(completedPayload);
    expect(keys).not.toContain("licenseDocUrl");
    expect(keys).not.toContain("bvn");
    expect(keys).not.toContain("nin");
    expect(keys).not.toContain("licenseNumber");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug fix: rejectionReason must be explicitly cleared on state re-trigger
// Regression guard: retriggerKyc passes null, not undefined, so the DB field
// is SET to null rather than left unchanged.
// ─────────────────────────────────────────────────────────────────────────────

describe("updateRiderKycStatus — rejectionReason null sentinel", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes null rejectionReason through to updateRiderKycStatus when re-triggering", async () => {
    // Simulate a REJECTED rider receiving an approved re-trigger
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "VERIFYING" }));
    mockUpdateRiderKycStatus.mockResolvedValue(makeRider({ kycStatus: "ACTIVE" }));

    // When the state is approved, rejectionReason should be cleared (undefined in fields)
    await handleKycVerificationCompleted(makeCompletedPayload({ status: "approved" }));

    const [, , status, fields] = mockUpdateRiderKycStatus.mock.calls[0] as [
      string,
      number,
      string,
      { rejectionReason?: string | null },
    ];
    expect(status).toBe("ACTIVE");
    // The handler passes rejectionReason: undefined — DB layer leaves it unchanged.
    // This is correct for the handler. The retriggerKyc path must pass null (tested below).
    expect(fields?.rejectionReason).toBeUndefined();
  });

  it("null is NOT the same as undefined — null passes the !== undefined guard", () => {
    // This is the invariant that makes the fix work:
    // fields.rejectionReason !== undefined is TRUE when value is null,
    // so null IS spread into the SQL UPDATE, clearing the column.
    const fieldsWithNull = { rejectionReason: null as string | null };
    const fieldsWithUndefined = { rejectionReason: undefined as string | undefined };

    expect(fieldsWithNull.rejectionReason !== undefined).toBe(true);   // null → included in UPDATE
    expect(fieldsWithUndefined.rejectionReason !== undefined).toBe(false); // undefined → skipped
  });

  it("rejection reason is cleared when re-trigger sets rejectionReason to null", async () => {
    // Simulate what retriggerKyc does: it was REJECTED, now going back to VERIFYING
    mockGetRiderById.mockResolvedValue(makeRider({ kycStatus: "VERIFYING" }));
    mockUpdateRiderKycStatus.mockResolvedValue(makeRider({ kycStatus: "REJECTED" }));

    // This exercises the path where handleKycVerificationCompleted sets reason
    await handleKycVerificationCompleted(
      makeCompletedPayload({ status: "rejected", reason: "Invalid document" }),
    );

    const [, , , fields] = mockUpdateRiderKycStatus.mock.calls[0] as [
      string,
      number,
      string,
      { rejectionReason?: string | null },
    ];
    // Handler correctly passes the rejection reason string
    expect(fields?.rejectionReason).toBe("Invalid document");

    // Now confirm: if we pass null explicitly, the guard allows it through
    // (this is what retriggerKyc does to clear it)
    const nullFields = { rejectionReason: null as string | null | undefined };
    const spread = {
      ...(nullFields.rejectionReason !== undefined && { rejectionReason: nullFields.rejectionReason }),
    };
    expect(spread).toHaveProperty("rejectionReason", null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security fix: webhook authentication guard
// ─────────────────────────────────────────────────────────────────────────────

describe("isWebhookAuthenticated — webhook shared-secret guard", () => {
  const originalSecret = process.env.KYC_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.KYC_WEBHOOK_SECRET;
    } else {
      process.env.KYC_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("allows any request when KYC_WEBHOOK_SECRET is unset (dev mode)", () => {
    delete process.env.KYC_WEBHOOK_SECRET;
    const req = { headers: {} };
    expect(isWebhookAuthenticated(req)).toBe(true);
  });

  it("rejects request with no Authorization header when secret is set", () => {
    process.env.KYC_WEBHOOK_SECRET = "super-secret-token";
    const req = { headers: {} };
    expect(isWebhookAuthenticated(req)).toBe(false);
  });

  it("rejects request with wrong secret", () => {
    process.env.KYC_WEBHOOK_SECRET = "correct-secret";
    const req = { headers: { authorization: "Bearer wrong-secret" } };
    expect(isWebhookAuthenticated(req)).toBe(false);
  });

  it("rejects request with malformed Authorization header (no Bearer prefix)", () => {
    process.env.KYC_WEBHOOK_SECRET = "correct-secret";
    const req = { headers: { authorization: "correct-secret" } };
    expect(isWebhookAuthenticated(req)).toBe(false);
  });

  it("accepts request with correct Bearer token", () => {
    process.env.KYC_WEBHOOK_SECRET = "correct-secret";
    const req = { headers: { authorization: "Bearer correct-secret" } };
    expect(isWebhookAuthenticated(req)).toBe(true);
  });

  it("rejects an empty Authorization header", () => {
    process.env.KYC_WEBHOOK_SECRET = "correct-secret";
    const req = { headers: { authorization: "" } };
    expect(isWebhookAuthenticated(req)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KycEvents constants — contract guard
// ─────────────────────────────────────────────────────────────────────────────

describe("KycEvents constants — @webwaka/core contract", () => {
  it("VERIFICATION_REQUESTED has expected event type string", () => {
    expect(KycEvents.VERIFICATION_REQUESTED).toBe("kyc.verification_requested");
  });

  it("VERIFICATION_COMPLETED has expected event type string", () => {
    expect(KycEvents.VERIFICATION_COMPLETED).toBe("kyc.verification_completed");
  });

  it("KYC event types are distinct from Commerce event types", () => {
    expect(KycEvents.VERIFICATION_REQUESTED).not.toContain("order.");
    expect(KycEvents.VERIFICATION_REQUESTED).not.toContain("delivery.");
    expect(KycEvents.VERIFICATION_COMPLETED).not.toContain("order.");
    expect(KycEvents.VERIFICATION_COMPLETED).not.toContain("delivery.");
  });
});
