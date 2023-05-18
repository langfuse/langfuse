import { adminRouter } from "./router/admin";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
