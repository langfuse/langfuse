import { env } from "@/src/env.mjs";
import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const environmentRouter = createTRPCRouter({
  // NEXT_PUBLIC_ does not work on Docker containers.
  // Hence, this needs to be pulled form the server.
  enableExperimentalFeatures: publicProcedure.query(
    () => env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
  ),
});
