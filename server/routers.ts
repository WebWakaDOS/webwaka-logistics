import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { parcelsRouter } from "./routers/parcels";
import { logisticsRouter } from "./routers/logistics";
import { dispatchRouter } from "./routers/dispatch";
import { warehouseRouter } from "./routers/warehouse";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  /** LOG-2: Parcel & Delivery [Part 10.4] */
  parcels: parcelsRouter,

  /** P04: Delivery Request Lifecycle API */
  logistics: logisticsRouter,

  /** T-LOG-03: Geospatial Order Clustering & Dispatch */
  dispatch: dispatchRouter,

  /** T-LOG-04: Offline-First Warehouse Receiving Scanner */
  warehouse: warehouseRouter,

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
