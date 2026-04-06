import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { webhookRouter } from "../webhooks/webhookRouter";
import { commerceEventRouter } from "../events/commerceEventRouter";
import { kycEventRouter } from "../events/kycEventRouter";
import { transportIntegrationRouter } from "../transport-integration";
import { sdk } from "./sdk";
import { getProofOfDelivery, getParcelById } from "../parcels.db";
import { createLogger } from "../logger";
import {
  publicTrackingLimiter,
  authLimiter,
  apiLimiter,
  trpcLimiter,
} from "./rateLimit";

const logger = createLogger("Server");

const WEBHOOK_PATHS = ["/api/webhooks", "/api/events/commerce", "/api/events/kyc", "/internal"];
const OAUTH_PATHS = ["/api/oauth"];

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Raw body capture for webhook routes (MUST precede express.json) ─────────
  // HMAC verification requires the raw request body before JSON parsing.
  // Capture it and store as req.rawBody for webhook handlers.
  app.use((req, res, next) => {
    const isWebhook = WEBHOOK_PATHS.some(p => req.path.startsWith(p));
    if (!isWebhook) {
      next();
      return;
    }
    express.raw({ type: "application/json", limit: "10mb" })(req, res, () => {
      if (Buffer.isBuffer(req.body)) {
        (req as express.Request & { rawBody: Buffer }).rawBody = req.body;
        try {
          req.body = JSON.parse(req.body.toString("utf8"));
        } catch {
          req.body = {};
        }
      }
      next();
    });
  });

  // ── JSON body parsing for non-webhook routes ─────────────────────────────────
  app.use((req, _res, next) => {
    const isWebhook = WEBHOOK_PATHS.some(p => req.path.startsWith(p));
    if (isWebhook) { next(); return; }
    express.json({ limit: "50mb" })(req, _res, next);
  });
  app.use((req, _res, next) => {
    const isWebhook = WEBHOOK_PATHS.some(p => req.path.startsWith(p));
    if (isWebhook) { next(); return; }
    express.urlencoded({ limit: "50mb", extended: true })(req, _res, next);
  });

  // ── CSRF: Origin validation for all mutating routes ──────────────────────────
  // Webhooks and OAuth callbacks are excluded — they come from external origins.
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean)
  );
  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const isWebhook = WEBHOOK_PATHS.some(p => req.path.startsWith(p));
    const isOAuth = OAUTH_PATHS.some(p => req.path.startsWith(p));
    if (isWebhook || isOAuth) {
      next();
      return;
    }
    const origin = req.headers.origin ?? "";
    const host = `${req.protocol}://${req.headers.host}`;
    if (!origin || origin === host || allowedOrigins.has(origin)) {
      next();
      return;
    }
    logger.warn("CSRF: rejected cross-origin request", { origin, host, path: req.path });
    res.status(403).json({ error: "Forbidden — cross-origin request rejected" });
  });

  // ── Rate limiters ────────────────────────────────────────────────────────────
  app.use("/track", publicTrackingLimiter);
  app.use("/api/oauth", authLimiter);
  app.use("/api/trpc", trpcLimiter);
  app.use("/api", apiLimiter);

  // ── OAuth callback under /api/oauth/callback ─────────────────────────────────
  registerOAuthRoutes(app);

  // ── P04: Provider webhook endpoints ─────────────────────────────────────────
  app.use("/api/webhooks", webhookRouter);

  // ── P04: Inbound commerce event endpoint ────────────────────────────────────
  app.use("/api/events/commerce", commerceEventRouter);

  // ── T-LOG-05: KYC verification webhook from Fintech repo ────────────────────
  app.use("/api/events/kyc", kycEventRouter);

  // ── P12: Transport ↔ Logistics inter-service event endpoint ─────────────────
  app.use("/internal", transportIntegrationRouter);

  // ── QA-LOG-2: REST endpoint — GET /api/deliveries/:id/pod ───────────────────
  app.get("/api/deliveries/:id/pod", async (req, res) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ success: false, error: "Unauthorized — valid session required" });
      return;
    }

    const parcelId = parseInt(req.params.id, 10);
    if (isNaN(parcelId) || parcelId <= 0) {
      res.status(400).json({ success: false, error: "Invalid parcel ID" });
      return;
    }

    const tenantId =
      (req.headers["x-tenant-id"] as string | undefined) ??
      (user as { tenantId?: string }).tenantId ??
      "";

    if (!tenantId) {
      res.status(400).json({ success: false, error: "Missing tenant context — include X-Tenant-Id header" });
      return;
    }

    try {
      const parcel = await getParcelById(tenantId, parcelId);
      if (!parcel) {
        res.status(404).json({ success: false, error: "Delivery not found" });
        return;
      }

      const isAgent = (user as { role?: string }).role === "agent";
      const isAdmin = (user as { role?: string }).role === "admin";
      if (isAgent && !isAdmin && parcel.assignedAgentId !== (user as { id?: number }).id) {
        res.status(403).json({ success: false, error: "Forbidden — this delivery is not assigned to you" });
        return;
      }

      const pod = await getProofOfDelivery(tenantId, parcelId);
      if (!pod) {
        res.status(404).json({ success: false, error: "No proof of delivery found for this delivery" });
        return;
      }

      res.json({
        success: true,
        data: {
          id: pod.id,
          parcelId: pod.parcelId,
          trackingNumber: parcel.trackingNumber,
          imageUrl: pod.imageUrl ?? null,
          signatureUrl: pod.signatureUrl ?? null,
          receivedByName: pod.receivedByName,
          receivedByRelation: pod.receivedByRelation,
          createdAt: pod.createdAt,
        },
      });
    } catch (err) {
      logger.error("DeliveriesPodEndpoint error", { error: String(err) });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // ── tRPC API ─────────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── Frontend (Vite dev or static) ────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(err => {
  process.stderr.write(`[Server] Fatal startup error: ${err}\n`);
  process.exit(1);
});
