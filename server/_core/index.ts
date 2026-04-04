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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // P04: Provider webhook endpoints
  app.use("/api/webhooks", webhookRouter);
  // P04: Inbound commerce event endpoint
  app.use("/api/events/commerce", commerceEventRouter);
  // T-LOG-05: KYC verification webhook from Fintech repo
  app.use("/api/events/kyc", kycEventRouter);
  // P12: Transport ↔ Logistics inter-service event endpoint
  app.use("/internal", transportIntegrationRouter);

  // ── QA-LOG-2: REST endpoint — GET /api/deliveries/:id/pod ─────────────────
  // Returns the proof-of-delivery record for a specific delivery (parcel) ID.
  // Requires a valid session JWT with the `view:deliveries` permission.
  // Drivers cannot access deliveries assigned to other drivers (tenant-scoped).
  app.get("/api/deliveries/:id/pod", async (req, res) => {
    // 1. Authenticate the request
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ success: false, error: "Unauthorized — valid session required" });
      return;
    }

    // 2. Validate the parcel ID
    const parcelId = parseInt(req.params.id, 10);
    if (isNaN(parcelId) || parcelId <= 0) {
      res.status(400).json({ success: false, error: "Invalid parcel ID" });
      return;
    }

    // 3. Resolve tenant from request headers or user record
    const tenantId =
      (req.headers["x-tenant-id"] as string | undefined) ??
      (user as { tenantId?: string }).tenantId ??
      "";

    if (!tenantId) {
      res.status(400).json({ success: false, error: "Missing tenant context — include X-Tenant-Id header" });
      return;
    }

    try {
      // 4. Verify the parcel belongs to this tenant
      const parcel = await getParcelById(tenantId, parcelId);
      if (!parcel) {
        res.status(404).json({ success: false, error: "Delivery not found" });
        return;
      }

      // 5. RBAC: riders can only view their own deliveries
      const isAgent = (user as { role?: string }).role === "agent";
      const isAdmin = (user as { role?: string }).role === "admin";
      if (isAgent && !isAdmin && parcel.assignedAgentId !== (user as { id?: number }).id) {
        res.status(403).json({ success: false, error: "Forbidden — this delivery is not assigned to you" });
        return;
      }

      // 6. Fetch the POD record
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
      console.error("[DeliveriesPodEndpoint] Error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
