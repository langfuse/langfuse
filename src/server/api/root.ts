import { createTRPCRouter } from "~/server/api/trpc";
import { exampleRouter } from "~/server/api/routers/example";
import { traceRouter } from "./routers/traces";
import { llmCallRouter } from "./routers/llmCalls";
import { scoresRouter } from "./routers/scores";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  example: exampleRouter,
  traces: traceRouter,
  llmCalls: llmCallRouter,
  scores: scoresRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
