import * as z from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  listCachedEntries,
  clearCache,
  deleteCachedEntry,
  getCachedResponse,
} from "./cache-service";

export const llmCacheRouter = createTRPCRouter({
  list: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return listCachedEntries({ projectId: input.projectId });
    }),

  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), contentHash: z.string() }))
    .query(async ({ input }) => {
      const cached = await getCachedResponse({
        projectId: input.projectId,
        contentHash: input.contentHash,
      });
      if (!cached) return null;
      return JSON.parse(cached) as unknown;
    }),

  clear: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      const count = await clearCache({ projectId: input.projectId });
      return { cleared: count };
    }),

  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), contentHash: z.string() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteCachedEntry({
        projectId: input.projectId,
        contentHash: input.contentHash,
      });
      return { deleted };
    }),
});
