import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";

export const versionsRouter = createTRPCRouter({
  buildId: publicProcedure.query(async () => {
    return process.env.NEXT_JS_BUILD_ID;
  }),
});
