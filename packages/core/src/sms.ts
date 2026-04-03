/**
 * @webwaka/core — Termii SMS Provider
 * Build Once, Use Everywhere. This is the single authoritative Termii client for the platform.
 * Do NOT build custom SMS clients in individual repos — import from here.
 *
 * Docs: https://developers.termii.com/
 */

export interface TermiiSmsOptions {
  /** Termii API key from environment */
  apiKey: string;
  /** Termii sender ID (registered alphanumeric, e.g. "WebWaka") */
  senderId?: string;
  /** Termii channel: "generic" (OTP-capable) or "dnd" */
  channel?: "generic" | "dnd" | "WhatsApp";
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an SMS message via Termii.
 * Returns a result object — never throws — so callers can decide how to handle failures.
 */
export async function sendTermiiSms(
  to: string,
  message: string,
  options: TermiiSmsOptions
): Promise<SendSmsResult> {
  const { apiKey, senderId = "WebWaka", channel = "generic" } = options;

  const normalizedPhone = normalizeNigerianPhone(to);

  try {
    const response = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalizedPhone,
        from: senderId,
        sms: message,
        type: "plain",
        channel,
        api_key: apiKey,
      }),
    });

    const body = (await response.json()) as { message_id?: string; message?: string; code?: string };

    if (!response.ok) {
      return {
        success: false,
        error: body.message ?? `Termii HTTP ${response.status}`,
      };
    }

    return { success: true, messageId: body.message_id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Normalise a Nigerian phone number to international format (234XXXXXXXXXX).
 * Handles: 080XXXXXXXX, +234XXXXXXXXXX, 234XXXXXXXXXX
 */
export function normalizeNigerianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("234") && digits.length >= 13) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `234${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `234${digits}`;
  }
  return digits;
}
