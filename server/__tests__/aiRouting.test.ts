/**
 * Phase 2: AI Route Optimization — Unit Tests
 * Covers: `getAICompletion()` — happy path, fallback, edge cases.
 * All LLM calls are mocked; no network or DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must appear before module imports
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
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

import { getAICompletion, type RouteStop } from "../_core/aiRouting";
import { invokeLLM } from "../_core/llm";

const mockInvokeLLM = vi.mocked(invokeLLM);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeStop(id: number, city: string): RouteStop {
  return {
    id,
    label: `WW-00${id}`,
    address: `${id} Test Street`,
    city,
    state: "Lagos",
  };
}

function makeLLMResult(content: string) {
  return {
    id: "test-id",
    created: Date.now(),
    model: "gemini-2.5-flash",
    choices: [{ index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("getAICompletion — happy path", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns optimized IDs in the order the LLM suggests", async () => {
    const stops = [makeStop(10, "Ikeja"), makeStop(20, "Victoria Island"), makeStop(30, "Surulere")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[20, 30, 10]"));

    const result = await getAICompletion(stops);

    expect(result.optimizedIds).toEqual([20, 30, 10]);
    expect(result.aiSucceeded).toBe(true);
    expect(result.stopCount).toBe(3);
  });

  it("successfully sorts a list of 5+ addresses into an optimised route", async () => {
    const stops = [
      makeStop(1, "Ikeja"),
      makeStop(2, "Surulere"),
      makeStop(3, "Victoria Island"),
      makeStop(4, "Lekki"),
      makeStop(5, "Ajah"),
    ];
    // AI suggests Island → Lekki → Ajah → Surulere → Ikeja (Mainland last)
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[3, 4, 5, 2, 1]"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(true);
    expect(result.optimizedIds).toEqual([3, 4, 5, 2, 1]);
    expect(result.stopCount).toBe(5);
  });

  it("returns the same order when AI confirms original order is optimal", async () => {
    const stops = [makeStop(1, "Ikeja"), makeStop(2, "Agege"), makeStop(3, "Alimosho")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[1, 2, 3]"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(true);
    expect(result.optimizedIds).toEqual([1, 2, 3]);
  });

  it("passes GPS coordinates to the LLM when provided", async () => {
    const stops: RouteStop[] = [
      { id: 1, label: "WW-001", address: "A St", city: "Ikeja", state: "Lagos", lat: 6.6018, lng: 3.3515 },
      { id: 2, label: "WW-002", address: "B St", city: "VI", state: "Lagos", lat: 6.4281, lng: 3.4219 },
    ];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[2, 1]"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(true);
    expect(result.optimizedIds).toEqual([2, 1]);

    // Verify GPS coordinates were embedded in the LLM prompt
    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find(m => m.role === "user")?.content;
    expect(typeof userMessage).toBe("string");
    expect(userMessage as string).toContain("6.6018");
  });

  it("includes startAddress in the prompt when provided", async () => {
    const stops = [makeStop(1, "Ikeja"), makeStop(2, "VI")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[1, 2]"));

    await getAICompletion(stops, { startAddress: "WebWaka Hub, Yaba" });

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const userMessage = callArgs.messages.find(m => m.role === "user")?.content;
    expect(userMessage as string).toContain("WebWaka Hub, Yaba");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fallback / error recovery
// ─────────────────────────────────────────────────────────────────────────────

describe("getAICompletion — fallback behaviour", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("falls back to original order when LLM throws", async () => {
    const stops = [makeStop(5, "Ikeja"), makeStop(6, "VI"), makeStop(7, "Lekki")];
    mockInvokeLLM.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([5, 6, 7]);
    expect(result.stopCount).toBe(3);
  });

  it("falls back when LLM returns non-JSON text", async () => {
    const stops = [makeStop(1, "Ikeja"), makeStop(2, "VI")];
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResult("Sorry, I cannot optimize routes in this context."),
    );

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([1, 2]);
  });

  it("falls back when LLM returns an incomplete array (missing IDs)", async () => {
    const stops = [makeStop(1, "A"), makeStop(2, "B"), makeStop(3, "C")];
    // Only returns 2 of 3 IDs
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[1, 2]"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([1, 2, 3]);
  });

  it("falls back when LLM includes IDs not in the input", async () => {
    const stops = [makeStop(10, "A"), makeStop(20, "B")];
    // ID 99 is not in the input
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[99, 10]"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([10, 20]);
  });

  it("falls back when LLM returns non-number values in the array", async () => {
    const stops = [makeStop(1, "A"), makeStop(2, "B")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult('["a", "b"]'));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([1, 2]);
  });

  it("handles LLM response wrapped in markdown code fences", async () => {
    const stops = [makeStop(1, "Ikeja"), makeStop(2, "VI"), makeStop(3, "Lekki")];
    // AI wraps the array in ```json code fences
    mockInvokeLLM.mockResolvedValueOnce(
      makeLLMResult("```json\n[3, 1, 2]\n```"),
    );

    const result = await getAICompletion(stops);

    // The regex `\[[\d,\s]+\]` should still match the array inside the code fence
    expect(result.aiSucceeded).toBe(true);
    expect(result.optimizedIds).toEqual([3, 1, 2]);
  });

  it("falls back when LLM returns duplicate IDs", async () => {
    const stops = [makeStop(1, "A"), makeStop(2, "B"), makeStop(3, "C")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[1, 1, 3]"));

    const result = await getAICompletion(stops);

    // Deduplicated [1, 3] has length 2, not 3 — triggers fallback
    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([1, 2, 3]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("getAICompletion — edge cases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns original order without calling LLM for a single stop", async () => {
    const result = await getAICompletion([makeStop(1, "Ikeja")]);

    expect(result.aiSucceeded).toBe(false);
    expect(result.optimizedIds).toEqual([1]);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns empty array for empty input without calling LLM", async () => {
    const result = await getAICompletion([]);

    expect(result.optimizedIds).toEqual([]);
    expect(result.stopCount).toBe(0);
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("correctly handles exactly 2 stops", async () => {
    const stops = [makeStop(10, "Ikeja"), makeStop(20, "VI")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[20, 10]"));

    const result = await getAICompletion(stops);

    expect(result.aiSucceeded).toBe(true);
    expect(result.optimizedIds).toEqual([20, 10]);
  });

  it("uses system prompt referencing Nigerian urban markets", async () => {
    const stops = [makeStop(1, "Ikeja"), makeStop(2, "VI")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[1, 2]"));

    await getAICompletion(stops);

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    const systemMsg = callArgs.messages.find(m => m.role === "system")?.content;
    expect(typeof systemMsg).toBe("string");
    expect(systemMsg as string).toContain("Nigerian");
  });

  it("respects custom maxTokens option", async () => {
    const stops = [makeStop(1, "A"), makeStop(2, "B")];
    mockInvokeLLM.mockResolvedValueOnce(makeLLMResult("[1, 2]"));

    await getAICompletion(stops, { maxTokens: 256 });

    const callArgs = mockInvokeLLM.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(256);
  });
});
