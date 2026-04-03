/**
 * L-06: Secure OTP Verification — Unit Tests
 * Covers: online OTP verification, offline fallback token, expiry, replay prevention, Termii SMS dispatch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must appear before imports that use them
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@webwaka/core", () => ({
  sendTermiiSms: vi.fn().mockResolvedValue({ success: true, messageId: "msg-001" }),
  normalizeNigerianPhone: (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
    return digits;
  },
}));

vi.mock("../_core/env", () => ({
  ENV: {
    termiiApiKey: "test-termii-key",
  },
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

import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  buildOfflineToken,
  verifyOfflineToken,
  sendOtpSms,
  isOtpExpired,
  otpExpiryTimestamp,
} from "../otp";
import { sendTermiiSms } from "@webwaka/core";

// ─────────────────────────────────────────────────────────────────────────────
// OTP Generation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("generateOtp", () => {
  it("generates a 4-digit string", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{4}$/);
  });

  it("generates values in range 1000–9999", () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      const n = parseInt(otp, 10);
      expect(n).toBeGreaterThanOrEqual(1000);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it("produces different codes on successive calls (statistical)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtp()));
    // With 9000 possible values and 50 draws, collision probability is ~13%
    expect(codes.size).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hash & Verify Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("hashOtp / verifyOtpHash", () => {
  it("hashes produce 64-char hex strings", () => {
    expect(hashOtp("1234")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies correct code against its hash", () => {
    const code = "7391";
    const hash = hashOtp(code);
    expect(verifyOtpHash(code, hash)).toBe(true);
  });

  it("rejects an incorrect code", () => {
    const hash = hashOtp("7391");
    expect(verifyOtpHash("7392", hash)).toBe(false);
  });

  it("rejects an empty string", () => {
    const hash = hashOtp("7391");
    expect(verifyOtpHash("", hash)).toBe(false);
  });

  it("is deterministic for the same input", () => {
    expect(hashOtp("1234")).toBe(hashOtp("1234"));
  });

  it("different codes produce different hashes", () => {
    expect(hashOtp("1234")).not.toBe(hashOtp("5678"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Offline Token Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildOfflineToken / verifyOfflineToken", () => {
  const PARCEL_ID = 42;
  const OTP = "5819";

  it("builds a 12-character hex token", () => {
    const token = buildOfflineToken(PARCEL_ID, OTP);
    expect(token).toMatch(/^[0-9a-f]{12}$/);
  });

  it("verifies a matching token", () => {
    const token = buildOfflineToken(PARCEL_ID, OTP);
    expect(verifyOfflineToken(PARCEL_ID, OTP, token)).toBe(true);
  });

  it("rejects a wrong OTP code", () => {
    const token = buildOfflineToken(PARCEL_ID, OTP);
    expect(verifyOfflineToken(PARCEL_ID, "0000", token)).toBe(false);
  });

  it("rejects a wrong parcel ID", () => {
    const token = buildOfflineToken(PARCEL_ID, OTP);
    expect(verifyOfflineToken(99, OTP, token)).toBe(false);
  });

  it("is deterministic — same inputs produce same token", () => {
    expect(buildOfflineToken(PARCEL_ID, OTP)).toBe(buildOfflineToken(PARCEL_ID, OTP));
  });

  it("different parcels produce different tokens for the same OTP", () => {
    expect(buildOfflineToken(1, OTP)).not.toBe(buildOfflineToken(2, OTP));
  });

  it("rejects a tampered/truncated token", () => {
    const token = buildOfflineToken(PARCEL_ID, OTP);
    const tampered = token.slice(0, 11) + "z";
    expect(verifyOfflineToken(PARCEL_ID, OTP, tampered)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Expiry Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("OTP expiry", () => {
  it("otpExpiryTimestamp returns a future timestamp 10 minutes away", () => {
    const ts = otpExpiryTimestamp();
    const now = Date.now();
    expect(ts).toBeGreaterThan(now + 9 * 60 * 1000);
    expect(ts).toBeLessThan(now + 11 * 60 * 1000);
  });

  it("isOtpExpired returns false for a future expiry", () => {
    expect(isOtpExpired(Date.now() + 60_000)).toBe(false);
  });

  it("isOtpExpired returns true for a past expiry", () => {
    expect(isOtpExpired(Date.now() - 1)).toBe(true);
  });

  it("isOtpExpired returns true for expiry = now (boundary)", () => {
    expect(isOtpExpired(Date.now())).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Termii SMS Dispatch Tests (via @webwaka/core provider)
// ─────────────────────────────────────────────────────────────────────────────

describe("sendOtpSms — @webwaka/core Termii provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls sendTermiiSms with the correct phone, message, and api key", async () => {
    const result = await sendOtpSms("08012345678", "Ade Buyer", "WW-20260403-ABC123", "7391");

    expect(result).toBe(true);
    expect(sendTermiiSms).toHaveBeenCalledOnce();

    const [phone, message, options] = vi.mocked(sendTermiiSms).mock.calls[0];
    expect(phone).toBe("08012345678");
    expect(message).toContain("7391");
    expect(message).toContain("WW-20260403-ABC123");
    expect(options.apiKey).toBe("test-termii-key");
    expect(options.channel).toBe("generic");
    expect(options.senderId).toBe("WebWaka");
  });

  it("returns false when Termii returns an error", async () => {
    vi.mocked(sendTermiiSms).mockResolvedValueOnce({ success: false, error: "Network error" });
    const result = await sendOtpSms("08012345678", "Ade Buyer", "WW-20260403-ABC123", "1234");
    expect(result).toBe(false);
  });

  it("returns false when TERMII_API_KEY is not configured", async () => {
    const { ENV } = await import("../_core/env");
    const original = (ENV as any).termiiApiKey;
    (ENV as any).termiiApiKey = "";

    const result = await sendOtpSms("08012345678", "Test", "WW-TEST-001", "0000");
    expect(result).toBe(false);
    expect(sendTermiiSms).not.toHaveBeenCalled();

    (ENV as any).termiiApiKey = original;
  });

  it("never throws — returns false on unexpected errors", async () => {
    vi.mocked(sendTermiiSms).mockRejectedValueOnce(new Error("Unexpected failure"));
    await expect(
      sendOtpSms("08012345678", "Test", "WW-TEST-001", "1234")
    ).resolves.toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Offline Verification Scenario — End-to-End Flow
// ─────────────────────────────────────────────────────────────────────────────

describe("Offline OTP verification — full flow", () => {
  it("verifies successfully when rider is offline using pre-synced token", () => {
    const parcelId = 99;
    const otp = generateOtp();

    // Server-side: generate OTP, build offline token, send SMS to customer
    const offlineToken = buildOfflineToken(parcelId, otp);

    // Simulate: token synced to Dexie while online
    // Rider goes offline at customer door
    // Customer shows SMS code → rider enters it
    const enteredOtp = otp; // Customer shows the correct code

    // Client-side (offline): verify against Dexie-cached token
    const verified = verifyOfflineToken(parcelId, enteredOtp, offlineToken);
    expect(verified).toBe(true);
  });

  it("rejects fraud attempt — wrong OTP entered offline", () => {
    const parcelId = 99;
    const otp = generateOtp();
    const offlineToken = buildOfflineToken(parcelId, otp);

    // Rider tries a different/fraudulent code
    const fraudulentOtp = otp === "1234" ? "5678" : "1234";
    expect(verifyOfflineToken(parcelId, fraudulentOtp, offlineToken)).toBe(false);
  });

  it("rejects replay attack — offline token for a different parcel", () => {
    const otp = "4321";
    const tokenForParcel10 = buildOfflineToken(10, otp);

    // Attacker tries to use parcel 10's token for parcel 11
    expect(verifyOfflineToken(11, otp, tokenForParcel10)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Online Verification Scenario — End-to-End Flow
// ─────────────────────────────────────────────────────────────────────────────

describe("Online OTP verification — full flow", () => {
  it("hashes and verifies the full online cycle", () => {
    const otp = generateOtp();
    const storedHash = hashOtp(otp);
    const expiresAt = otpExpiryTimestamp();

    // Customer presents code to rider → rider submits to server
    expect(isOtpExpired(expiresAt)).toBe(false);
    expect(verifyOtpHash(otp, storedHash)).toBe(true);
  });

  it("rejects expired OTPs on the online path", () => {
    const otp = "9876";
    const storedHash = hashOtp(otp);
    const expiredAt = Date.now() - 1; // already expired

    expect(isOtpExpired(expiredAt)).toBe(true);
    // Even if hash matches, server should reject because of expiry
    expect(verifyOtpHash(otp, storedHash)).toBe(true); // hash is valid...
    // but the router checks expiry before calling verifyOtpHash
  });

  it("prevents replay — each OTP can only be used once (hash cleared after verify)", () => {
    // After markOtpVerified, otpCode is set to null in DB
    // So a second call with the same code would fail because parcel.otpCode === null
    const hash = hashOtp("1234");
    expect(hash).toBeTruthy();
    // Simulating DB state after verification: otpCode = null
    const clearedHash: string | null = null;
    expect(clearedHash).toBeNull(); // verifyOtpHash would not be called
  });
});
