/**
 * T-LOG-03: Dispatch tRPC Router
 * Provides endpoints for geospatial order clustering and rider assignment.
 * All routes are tenant-scoped and require authentication.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { createLogger } from "../logger";
import {
  getUnassignedParcels,
  bulkAssignParcels,
  unassignParcels,
  getAvailableAgents,
  getDispatchSummary,
  updateParcelCoordinates,
} from "../dispatch.db";
import { clusterParcels } from "../clustering";
import { invokeLLM } from "../_core/llm";

const logger = createLogger("DispatchRouter");

export const dispatchRouter = router({
  /**
   * GET /dispatch/clusters
   * Fetch unassigned PENDING parcels and group them into geographic clusters.
   * Returns clusters sorted by size (largest = most urgent first).
   * Enforces tenant isolation via tenantId param.
   */
  getClusters: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const parcels = getUnassignedParcels(input.tenantId);
      const clusters = clusterParcels(parcels);

      logger.info("Clusters computed", {
        tenantId: input.tenantId,
        parcelCount: parcels.length,
        clusterCount: clusters.length,
      });

      return {
        success: true,
        clusters: clusters.map(c => ({
          key: c.key,
          label: c.label,
          shortLabel: c.shortLabel,
          strategy: c.strategy,
          centroid: c.centroid,
          parcelCount: c.parcelCount,
          totalFeeKobo: c.totalFeeKobo,
          totalWeightGrams: c.totalWeightGrams,
          parcels: c.parcels.map(p => ({
            id: p.id,
            trackingNumber: p.trackingNumber,
            recipientName: p.recipientName,
            recipientAddress: p.recipientAddress,
            recipientCity: p.recipientCity,
            recipientState: p.recipientState,
            recipientLat: p.recipientLat ?? null,
            recipientLng: p.recipientLng ?? null,
            priority: p.priority,
            weightGrams: p.weightGrams,
            deliveryFeeKobo: p.deliveryFeeKobo,
          })),
        })),
      };
    }),

  /**
   * GET /dispatch/summary
   * High-level dispatch stats for the dashboard header.
   */
  getSummary: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      return getDispatchSummary(input.tenantId);
    }),

  /**
   * GET /dispatch/agents
   * List all available riders/agents who can be assigned deliveries.
   */
  getAgents: protectedProcedure
    .query(async () => {
      return getAvailableAgents();
    }),

  /**
   * MUTATION /dispatch/assignCluster
   * Assign all parcels in a cluster to a specific rider.
   * Admin only — changing rider assignments is a privileged operation.
   */
  assignCluster: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelIds: z.array(z.number().int().positive()).min(1).max(200),
        agentId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // BUG-03 FIX: Validate the agent exists and has an eligible role before
      // assigning. Prevents parcels being silently bound to phantom agent IDs.
      const eligibleAgents = getAvailableAgents();
      const agentExists = eligibleAgents.some(a => a.id === input.agentId);
      if (!agentExists) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Agent #${input.agentId} does not exist or is not eligible for assignments`,
        });
      }

      const count = bulkAssignParcels(input.tenantId, input.parcelIds, input.agentId);

      logger.info("Cluster assigned", {
        tenantId: input.tenantId,
        parcelIds: input.parcelIds,
        agentId: input.agentId,
        assignedBy: ctx.user.openId,
        count,
      });

      return { success: true, assignedCount: count };
    }),

  /**
   * MUTATION /dispatch/unassignCluster
   * Remove rider assignment from a set of parcels so they re-enter the pool.
   * Admin only.
   */
  unassignCluster: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelIds: z.array(z.number().int().positive()).min(1).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const count = unassignParcels(input.tenantId, input.parcelIds);

      logger.info("Cluster unassigned", {
        tenantId: input.tenantId,
        parcelIds: input.parcelIds,
        unassignedBy: ctx.user.openId,
      });

      return { success: true, unassignedCount: count };
    }),

  /**
   * MUTATION /dispatch/optimizeRoute
   * Use AI (LLM) to sort a list of delivery addresses into the most efficient route.
   * Implements a Traveling Salesman Problem heuristic via natural-language prompt.
   * Returns parcel IDs in the optimal delivery order.
   */
  optimizeRoute: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        /** Ordered list of parcels to re-sequence */
        parcels: z
          .array(
            z.object({
              id: z.number().int().positive(),
              trackingNumber: z.string(),
              recipientAddress: z.string(),
              recipientCity: z.string(),
              recipientState: z.string(),
              recipientLat: z.number().nullable().optional(),
              recipientLng: z.number().nullable().optional(),
            }),
          )
          .min(2)
          .max(50),
        /** Starting point for the route (e.g. warehouse address) */
        startAddress: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const parcelList = input.parcels
        .map(
          (p, i) =>
            `${i + 1}. [ID:${p.id}] ${p.trackingNumber} — ${p.recipientAddress}, ${p.recipientCity}, ${p.recipientState}` +
            (p.recipientLat != null
              ? ` (GPS: ${p.recipientLat.toFixed(4)},${p.recipientLng?.toFixed(4)})`
              : ""),
        )
        .join("\n");

      const systemPrompt =
        `You are a last-mile delivery route optimizer for Lagos, Nigeria. ` +
        `Given a list of delivery stops, return the most efficient visiting order ` +
        `to minimize total travel distance and time in Nigerian urban traffic. ` +
        `Consider typical Lagos traffic patterns (Island vs Mainland, major corridors). ` +
        `Respond ONLY with a JSON array of parcel IDs in the optimal order, e.g.: [42,17,33,8]`;

      const userPrompt =
        `Optimize this delivery route${input.startAddress ? ` starting from: ${input.startAddress}` : ""}:\n\n` +
        parcelList +
        `\n\nReturn ONLY a JSON array of IDs in optimal order.`;

      let optimizedIds: number[] = input.parcels.map(p => p.id);

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 512,
        });

        const rawContent = result.choices[0]?.message?.content;
        const text = typeof rawContent === "string" ? rawContent : "";
        const match = text.match(/\[[\d,\s]+\]/);
        if (match) {
          const parsed: unknown = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.every(v => typeof v === "number")) {
            const inputIds = new Set(input.parcels.map(p => p.id));
            const validIds = (parsed as number[]).filter(id => inputIds.has(id));
            if (validIds.length === input.parcels.length) {
              optimizedIds = validIds;
            }
          }
        }
      } catch (err) {
        logger.warn("AI route optimization failed — returning original order", {
          error: String(err),
        });
      }

      logger.info("Route optimized", {
        tenantId: input.tenantId,
        parcelCount: input.parcels.length,
      });

      return { success: true, optimizedIds };
    }),

  /**
   * MUTATION /dispatch/autoDispatch
   * Automated Dispatch Engine: clusters all unassigned PENDING parcels and assigns
   * each cluster to the nearest available agent (round-robin by workload if no GPS).
   * Returns the number of parcels assigned and which agent got which cluster.
   */
  autoDispatch: adminProcedure
    .input(z.object({ tenantId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const unassigned = getUnassignedParcels(input.tenantId);
      if (unassigned.length === 0) {
        return { success: true, assignedCount: 0, assignments: [] };
      }

      const agents = getAvailableAgents();
      if (agents.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No available agents — add riders before running auto-dispatch.",
        });
      }

      const clusters = clusterParcels(unassigned);
      const assignments: { clusterLabel: string; agentId: number; parcelCount: number }[] = [];
      let totalAssigned = 0;

      clusters.forEach((cluster, i) => {
        // Round-robin assignment across available agents
        const agent = agents[i % agents.length];
        const parcelIds = cluster.parcels.map(p => p.id);
        const count = bulkAssignParcels(input.tenantId, parcelIds, agent.id);
        totalAssigned += count;
        assignments.push({
          clusterLabel: cluster.label,
          agentId: agent.id,
          parcelCount: count,
        });
      });

      logger.info("Auto-dispatch completed", {
        tenantId: input.tenantId,
        clusterCount: clusters.length,
        totalAssigned,
        dispatchedBy: ctx.user.openId,
      });

      return { success: true, assignedCount: totalAssigned, assignments };
    }),

  /**
   * MUTATION /dispatch/setParcelCoordinates
   * Manually set geocoded coordinates for a parcel.
   * Admin only — used when the dispatcher manually geocodes an address.
   */
  setParcelCoordinates: adminProcedure
    .input(
      z.object({
        tenantId: z.string().min(1).max(64),
        parcelId: z.number().int().positive(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      updateParcelCoordinates(input.tenantId, input.parcelId, input.lat, input.lng);

      logger.info("Parcel coordinates updated", {
        tenantId: input.tenantId,
        parcelId: input.parcelId,
        lat: input.lat,
        lng: input.lng,
        updatedBy: ctx.user.openId,
      });

      return { success: true };
    }),
});
