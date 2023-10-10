import { env } from "@/src/env.mjs";
import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const runtimeEnvRouter = createTRPCRouter({
  all: publicProcedure.query(() => {
    return {
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES:
        env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES,
    };
  }),
});
