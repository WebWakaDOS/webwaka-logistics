/**
 * Rate Limiting Middleware [TASK-05]
 * Per-IP throttling for public and API endpoints.
 * Uses Cloudflare CF-Connecting-IP header when behind Cloudflare proxy.
 */

import rateLimit from "express-rate-limit";
import type { Request } from "express";

function getRealIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.length > 0) return cfIp;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip ?? "unknown";
}

const keyGenerator = (req: Request): string => getRealIp(req);

/** Public tracking endpoint — 30 req/min per IP */
export const publicTrackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please try again in a minute" },
  skip: req => req.method === "OPTIONS",
});

/** Auth endpoints — 10 req/min per IP */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts — please try again in a minute" },
  skip: req => req.method === "OPTIONS",
});

/** General API — 200 req/min per IP */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
  skip: req => req.method === "OPTIONS",
});

/** tRPC endpoint — 100 req/min per IP */
export const trpcLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many API requests — please slow down" },
  skip: req => req.method === "OPTIONS",
});
