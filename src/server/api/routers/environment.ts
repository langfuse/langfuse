import { env } from "@/src/env.mjs";
import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const environmentRouter = createTRPCRouter({
  enableExperimentalFeatures: publicProcedure.query(
    () => env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
  ),
});
