/**
 * Platform Logger [Part 9.3]
 * Zero console.log in committed code. All logging must go through this module.
 * Follows the WebWaka OS v4 governance rule: "Zero Console Logs — No console.log statements."
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}`;
  return entry.data !== undefined ? `${base} ${JSON.stringify(entry.data)}` : base;
}

function emit(level: LogLevel, module: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    level,
    module,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  const formatted = formatEntry(entry);
  // Platform-approved output channels — not console.log
  if (level === "error") {
    process.stderr.write(`${formatted}\n`);
  } else {
    process.stdout.write(`${formatted}\n`);
  }
}

export function createLogger(module: string) {
  return {
    info: (message: string, data?: unknown) => emit("info", module, message, data),
    warn: (message: string, data?: unknown) => emit("warn", module, message, data),
    error: (message: string, data?: unknown) => emit("error", module, message, data),
    debug: (message: string, data?: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        emit("debug", module, message, data);
      }
    },
  };
}
