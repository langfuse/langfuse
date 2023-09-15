import { createTRPCRouter } from "@/src/server/api/trpc";
import { traceRouter } from "./routers/traces";
import { generationsRouter } from "./routers/generations";
import { scoresRouter } from "./routers/scores";
import { dashboardRouter } from "@/src/features/dashboard/server/dashboardRouter";
import { projectsRouter } from "@/src/features/projects/server/projectsRouter";
import { apiKeysRouter } from "@/src/features/publicApi/server/apiKeyRouter";
import { projectMembersRouter } from "@/src/features/rbac/server/projectMembersRouter";
import { userRouter } from "@/src/server/api/routers/users";
import { publishTracesRouter } from "@/src/features/publicTraces/server/publishTracesRouter";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  traces: traceRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
  users: userRouter,
  apiKeys: apiKeysRouter,
  projectMembers: projectMembersRouter,
  publishTraces: publishTracesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
