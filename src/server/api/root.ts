import { createTRPCRouter } from "@/src/server/api/trpc";
import { traceRouter } from "./routers/traces";
import { llmCallRouter } from "./routers/llmCalls";
import { scoresRouter } from "./routers/scores";
import { dashboardRouter } from "@/src/features/dashboard/server/dashboardRouter";
import { projectsRouter } from "@/src/features/projects/server/projectsRouter";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  traces: traceRouter,
  llmCalls: llmCallRouter,
  scores: scoresRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
