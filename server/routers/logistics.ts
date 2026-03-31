/**
 * Delivery Request Lifecycle API [P04 — TASK 5]
 * Internal tRPC endpoints for the logistics team.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { CommerceEvents } from "@webwaka/core";
import {
  getDeliveryRequestByOrderId,
  updateDeliveryRequestStatus,
} from "../delivery.db";
import { publishCommerceEvent } from "../events/commerceEventBus";
import { createLogger } from "../logger";

const logger = createLogger("LogisticsRouter");

export const logisticsRouter = router({
  /**
   * GET /logistics/requests/:orderId
   * Returns the current delivery request status.
   */
  getRequest: protectedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .query(async ({ input }) => {
      const request = await getDeliveryRequestByOrderId(input.orderId);
      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Delivery request not found for orderId: ${input.orderId}`,
        });
      }
      return request;
    }),

  /**
   * PATCH /logistics/requests/:orderId/assign
   * Assigns the delivery request to a specific provider.
   */
  assignProvider: protectedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        provider: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const request = await getDeliveryRequestByOrderId(input.orderId);
      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Delivery request not found for orderId: ${input.orderId}`,
        });
      }

      if (request.status === "DELIVERED" || request.status === "CANCELLED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot assign provider — request is already ${request.status}`,
        });
      }

      await updateDeliveryRequestStatus(
        input.orderId,
        request.tenantId,
        "ASSIGNED",
        { assignedProvider: input.provider }
      );

      logger.info("Provider assigned", {
        orderId: input.orderId,
        provider: input.provider,
        assignedBy: ctx.user?.openId,
      });

      return { ok: true, orderId: input.orderId, assignedProvider: input.provider };
    }),

  /**
   * PATCH /logistics/requests/:orderId/cancel
   * Cancels a delivery request and publishes a FAILED status event.
   */
  cancelRequest: protectedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const request = await getDeliveryRequestByOrderId(input.orderId);
      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Delivery request not found for orderId: ${input.orderId}`,
        });
      }

      if (request.status === "DELIVERED" || request.status === "CANCELLED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel — request is already ${request.status}`,
        });
      }

      await updateDeliveryRequestStatus(input.orderId, request.tenantId, "CANCELLED");

      await publishCommerceEvent(CommerceEvents.DELIVERY_STATUS, {
        orderId: input.orderId,
        tenantId: request.tenantId,
        deliveryId: request.internalDeliveryId ?? input.orderId,
        provider: request.assignedProvider ?? "unknown",
        status: "FAILED",
        notes: input.reason ?? "Delivery cancelled by logistics team",
      });

      logger.info("Delivery request cancelled", {
        orderId: input.orderId,
        cancelledBy: ctx.user?.openId,
        reason: input.reason,
      });

      return { ok: true, orderId: input.orderId, status: "CANCELLED" };
    }),
});
