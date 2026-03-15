/**
 * Parcel Utility Functions [Part 10.4]
 * Pure functions — no side effects, fully testable.
 * Blueprint: Zero console.log, platform logger only.
 */

import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────────────────
// Tracking Number Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a unique WebWaka tracking number.
 * Format: WW + 10 uppercase alphanumeric characters = 12 chars total.
 * Example: WWAB3XK9P2MQ
 */
export function generateTrackingNumber(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `WW${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nigeria First: Monetary Conversions [Part 9.2]
// All monetary values stored as integers in kobo (1 NGN = 100 kobo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts naira amount to kobo (integer).
 * Always returns an integer — no floating point stored in DB.
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Converts kobo amount to naira (decimal).
 */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/**
 * Formats a kobo amount as a localised currency string.
 * Nigeria First: defaults to NGN.
 */
export function formatKoboAmount(kobo: number, currency = "NGN", locale = "en-NG"): string {
  const naira = koboToNaira(kobo);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(naira);
  } catch {
    return `${currency} ${naira.toFixed(2)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Transition Validation [Part 10.4 — Immutable event log]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valid status transitions for the parcel state machine.
 * Terminal states: DELIVERED, RETURNED.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["COLLECTED", "FAILED"],
  COLLECTED: ["IN_TRANSIT", "FAILED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "FAILED", "RETURNED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  FAILED: ["IN_TRANSIT", "RETURNED"],
  DELIVERED: [], // terminal
  RETURNED: [], // terminal
};

/**
 * Returns true if the transition from `from` to `to` is valid.
 */
export function isValidStatusTransition(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Nigeria First: WAT Timezone [Part 10.4]
// West Africa Time = UTC+1 (no DST)
// ─────────────────────────────────────────────────────────────────────────────

const WAT_LOCALE_MAP: Record<string, string> = {
  en: "en-NG",
  yo: "yo-NG",
  ig: "ig-NG",
  ha: "ha-NG",
};

/**
 * Formats a date/timestamp in WAT (West Africa Time, UTC+1).
 * Returns "—" for null/undefined values.
 */
export function formatWATDate(
  value: Date | string | number | null | undefined,
  locale = "en"
): string {
  if (value === null || value === undefined) return "—";

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return "—";

    const intlLocale = WAT_LOCALE_MAP[locale] ?? "en-NG";

    return new Intl.DateTimeFormat(intlLocale, {
      timeZone: "Africa/Lagos", // WAT = UTC+1, no DST
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives a tenantId from a user's openId.
 * In the current platform, tenantId = openId until multi-org is implemented.
 */
export function deriveTenantId(openId: string): string {
  return openId;
}
