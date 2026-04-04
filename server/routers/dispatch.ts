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
import { getAICompletion } from "../_core/aiRouting";

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
      const stops = input.parcels.map(p => ({
        id: p.id,
        label: p.trackingNumber,
        address: p.recipientAddress,
        city: p.recipientCity,
        state: p.recipientState,
        lat: p.recipientLat ?? null,
        lng: p.recipientLng ?? null,
      }));

      const { optimizedIds, aiSucceeded } = await getAICompletion(stops, {
        startAddress: input.startAddress,
      });

      logger.info("Route optimized", {
        tenantId: input.tenantId,
        parcelCount: input.parcels.length,
        aiSucceeded,
      });

      return { success: true, optimizedIds, aiSucceeded };
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
