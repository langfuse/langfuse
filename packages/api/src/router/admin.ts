import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const adminRouter = createTRPCRouter({
  demo: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(() => {
      return true;
    }),
});
