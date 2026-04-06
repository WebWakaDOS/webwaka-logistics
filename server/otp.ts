/**
 * L-06: Secure OTP Verification — Core Logic
 * Generates, stores, and verifies 4-digit OTPs for delivery proof.
 * Uses @webwaka/core Termii provider for SMS dispatch.
 */

import { createHash, createHmac, timingSafeEqual, randomInt } from "crypto";
import { sendTermiiSms } from "@webwaka/core";
import { ENV } from "./_core/env";
import { createLogger } from "./logger";

const logger = createLogger("OTP");

/** OTP is valid for 10 minutes */
const OTP_TTL_MS = 10 * 60 * 1000;

/** Offline fallback HMAC secret — scoped to this deployment */
const OFFLINE_HMAC_KEY = process.env.OTP_OFFLINE_SECRET ?? "webwaka-logistics-offline-otp-fallback";

// ─────────────────────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 4-digit OTP using Node.js crypto.randomInt.
 * Range: 0000–9999 (inclusive) — zero-padded to 4 digits so codes like "0042" are valid.
 * crypto.randomInt is CSPRNG-backed: suitable for security-sensitive one-time codes.
 */
export function generateOtp(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/**
 * SHA-256 hash an OTP code for safe storage.
 * The raw code is never persisted — only the hash.
 */
export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Timing-safe OTP comparison: compare user input hash vs stored hash.
 */
export function verifyOtpHash(inputCode: string, storedHash: string): boolean {
  const inputHash = hashOtp(inputCode);
  try {
    return timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

/**
 * Build an offline verification token for a given parcel + OTP.
 * This 6-hex-digit token is pre-computed and synced to the rider's Dexie store.
 * When the rider is offline, they can verify client-side without hitting the server.
 *
 * Format: HMAC-SHA256(parcelId|otpCode, OFFLINE_HMAC_KEY) → first 6 hex chars
 */
export function buildOfflineToken(parcelId: number, otpCode: string): string {
  return createHmac("sha256", OFFLINE_HMAC_KEY)
    .update(`${parcelId}|${otpCode}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Verify an offline token provided by the rider.
 */
export function verifyOfflineToken(parcelId: number, enteredOtp: string, storedToken: string): boolean {
  const expected = buildOfflineToken(parcelId, enteredOtp);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(storedToken, "hex"));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS Dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an OTP SMS to the parcel recipient via the @webwaka/core Termii provider.
 * Returns true if the SMS was accepted by Termii.
 * Logs a warning and returns false on failure — never throws so the status update
 * can still proceed.
 */
export async function sendOtpSms(
  recipientPhone: string,
  recipientName: string,
  trackingNumber: string,
  otpCode: string
): Promise<boolean> {
  const apiKey = ENV.termiiApiKey;

  if (!apiKey) {
    logger.warn("TERMII_API_KEY is not configured — OTP SMS will not be sent (non-fatal in dev)");
    return false;
  }

  const message =
    `[WebWaka] Your delivery OTP is: ${otpCode}. ` +
    `Share this code with your rider to confirm receipt of parcel ${trackingNumber}. ` +
    `Valid for 10 minutes. Do not share with anyone else.`;

  try {
    const result = await sendTermiiSms(recipientPhone, message, {
      apiKey,
      senderId: "WebWaka",
      channel: "generic",
    });

    if (!result.success) {
      logger.warn("Termii SMS failed", { phone: recipientPhone, error: result.error });
    } else {
      logger.info("OTP SMS sent", { messageId: result.messageId, tracking: trackingNumber });
    }

    return result.success;
  } catch (err) {
    logger.warn("Termii SMS threw unexpectedly — non-fatal", { error: String(err) });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expiry Helper
// ─────────────────────────────────────────────────────────────────────────────

export function otpExpiryTimestamp(): number {
  return Date.now() + OTP_TTL_MS;
}

export function isOtpExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}
