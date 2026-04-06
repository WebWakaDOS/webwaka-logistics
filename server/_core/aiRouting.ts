/**
 * AI Route Optimization — `getAICompletion()`
 * Phase 2: AI Route Optimization
 *
 * Standalone, testable utility that wraps `invokeLLM` for TSP-style delivery
 * route sorting. Separated from the tRPC router so it can be unit-tested
 * in isolation and reused outside the Dispatch router.
 */

import { invokeLLM } from "./llm";
import { createLogger } from "../logger";

const logger = createLogger("AIRouting");

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteStop {
  /** Unique identifier for this stop (parcel ID, waypoint ID, etc.) */
  id: number;
  /** Human-readable tracking number or label */
  label: string;
  /** Full street address */
  address: string;
  /** City or district */
  city: string;
  /** State or region */
  state: string;
  /** GPS latitude (optional — improves AI accuracy when provided) */
  lat?: number | null;
  /** GPS longitude (optional) */
  lng?: number | null;
}

export interface OptimizeRouteOptions {
  /** Starting point description (e.g. "WebWaka Hub, Yaba, Lagos") */
  startAddress?: string;
  /** Override the AI model. Defaults to gemini-2.5-flash. */
  model?: string;
  /** Max tokens for the AI response. Defaults to 512. */
  maxTokens?: number;
}

export interface OptimizeRouteResult {
  /** Stop IDs in the AI-recommended delivery order */
  optimizedIds: number[];
  /** True if the AI returned a valid response; false = original order used */
  aiSucceeded: boolean;
  /** Total number of stops processed */
  stopCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `getAICompletion` — sorts a list of delivery addresses into the most
 * efficient route using an LLM-powered TSP heuristic.
 *
 * Returns the stop IDs in optimal order.
 * Falls back gracefully to the original input order if the AI is unavailable
 * or returns an invalid response (non-fatal).
 *
 * @example
 * const result = await getAICompletion([
 *   { id: 1, label: "WW-001", address: "12 Marina St", city: "Lagos Island", state: "Lagos" },
 *   { id: 2, label: "WW-002", address: "4 Allen Ave", city: "Ikeja", state: "Lagos" },
 * ]);
 * // result.optimizedIds => [2, 1]  (Ikeja first → Island second)
 */
export async function getAICompletion(
  stops: RouteStop[],
  options: OptimizeRouteOptions = {},
): Promise<OptimizeRouteResult> {
  if (stops.length < 2) {
    return { optimizedIds: stops.map(s => s.id), aiSucceeded: false, stopCount: stops.length };
  }

  const { startAddress, maxTokens = 512 } = options;

  const stopList = stops
    .map(
      (s, i) =>
        `${i + 1}. [ID:${s.id}] ${s.label} — ${s.address}, ${s.city}, ${s.state}` +
        (s.lat != null ? ` (GPS: ${s.lat.toFixed(4)},${s.lng?.toFixed(4)})` : ""),
    )
    .join("\n");

  const systemPrompt =
    `You are a last-mile delivery route optimizer for Nigerian urban markets. ` +
    `Given a list of delivery stops, return the most efficient visiting order ` +
    `to minimize total travel distance and time. ` +
    `Consider local traffic patterns (e.g. Lagos Island vs Mainland, Abuja districts, Port Harcourt corridors). ` +
    `Respond ONLY with a JSON array of stop IDs in optimal order, e.g.: [42,17,33,8]. ` +
    `Do not include any explanation or additional text.`;

  const userPrompt =
    `Optimize this delivery route` +
    (startAddress ? ` starting from: ${startAddress}` : "") +
    `:\n\n${stopList}\n\nReturn ONLY a JSON array of IDs.`;

  const originalIds = stops.map(s => s.id);

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens,
    });

    const rawContent = result.choices[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : "";

    // Parse the JSON array from the response (may be wrapped in markdown code fences)
    const match = text.match(/\[[\d,\s]+\]/);
    if (!match) {
      logger.warn("AI returned no parseable array — using original order", { text: text.slice(0, 200) });
      return { optimizedIds: originalIds, aiSucceeded: false, stopCount: stops.length };
    }

    const parsed: unknown = JSON.parse(match[0]);

    if (!Array.isArray(parsed) || !parsed.every(v => typeof v === "number")) {
      logger.warn("AI returned non-number array — using original order");
      return { optimizedIds: originalIds, aiSucceeded: false, stopCount: stops.length };
    }

    // Validate: all original IDs must appear exactly once
    const inputIdSet = new Set(originalIds);
    const validIds = (parsed as number[]).filter(id => inputIdSet.has(id));
    const uniqueValidIds = Array.from(new Set(validIds));

    if (uniqueValidIds.length !== stops.length) {
      logger.warn("AI returned incomplete/duplicate IDs — using original order", {
        expected: stops.length,
        got: uniqueValidIds.length,
      });
      return { optimizedIds: originalIds, aiSucceeded: false, stopCount: stops.length };
    }

    logger.info("AI route optimization succeeded", {
      stopCount: stops.length,
      reordered: JSON.stringify(uniqueValidIds) !== JSON.stringify(originalIds),
    });

    return { optimizedIds: uniqueValidIds, aiSucceeded: true, stopCount: stops.length };
  } catch (err) {
    logger.warn("AI route optimization threw — using original order", { error: String(err) });
    return { optimizedIds: originalIds, aiSucceeded: false, stopCount: stops.length };
  }
}
