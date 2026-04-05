/**
 * WebWaka Logistics — LLM abstraction
 *
 * All AI calls route through webwaka-ai-platform (vendor-neutral gateway).
 * Previously called forge.manus.im directly — now normalized to platform standard.
 *
 * Env vars (set via ENV module):
 *   AI_PLATFORM_URL   — https://webwaka-ai-platform.workers.dev
 *   AI_PLATFORM_TOKEN — service-to-service bearer token
 *
 * Maintains the same InvokeParams/InvokeResult interface so aiRouting.ts
 * and any other callers need zero changes.
 */

import { ENV } from "./env";
import { createLogger } from "../logger";

const logger = createLogger("llm");

// ─── Public types (kept identical for backward compatibility) ─────────────────

export type Role = "system" | "user" | "assistant" | "tool" | "function";
export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };
export type FileContent = { type: "file_url"; file_url: { url: string; mime_type?: string } };
export type MessageContent = string | TextContent | ImageContent | FileContent;
export type Message = { role: Role; content: MessageContent | MessageContent[]; name?: string; tool_call_id?: string };
export type Tool = { type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } };
export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = { type: "function"; function: { name: string } };
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;
export type JsonSchema = { name: string; schema: Record<string, unknown>; strict?: boolean };
export type OutputSchema = JsonSchema;
export type ResponseFormat = { type: "text" } | { type: "json_object" } | { type: "json_schema"; json_schema: JsonSchema };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: Role; content: string | Array<TextContent | ImageContent | FileContent>; tool_calls?: ToolCall[] };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMessages(messages: Message[]): Array<{ role: string; content: string }> {
  return messages.map((m) => {
    const content = Array.isArray(m.content)
      ? m.content.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join("\n")
      : typeof m.content === "string"
      ? m.content
      : JSON.stringify(m.content);
    return { role: m.role, content };
  });
}

// ─── Core: invokeLLM ──────────────────────────────────────────────────────────

/**
 * Send a chat completion request through webwaka-ai-platform.
 * Throws on HTTP errors — callers (aiRouting.ts) catch and fall back gracefully.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const { messages, maxTokens, max_tokens } = params;

  if (!ENV.aiPlatformUrl || !ENV.aiPlatformToken) {
    throw new Error("AI_PLATFORM_URL / AI_PLATFORM_TOKEN not configured");
  }

  const body: Record<string, unknown> = {
    messages: normalizeMessages(messages),
    max_tokens: maxTokens ?? max_tokens ?? 512,
    temperature: 0.2,
  };

  logger.info("Invoking AI platform", { messageCount: messages.length });

  const response = await fetch(`${ENV.aiPlatformUrl}/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.aiPlatformToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`AI platform invocation failed: ${response.status} — ${err}`);
  }

  return (await response.json()) as InvokeResult;
}

