import { z } from "zod";
import { ForbiddenError } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { getProductBaseUrl } from "@/src/utils/base-url";
import {
  createSlackAgentCode,
  confirmSlackAgentConnection,
  disconnectSlackAgent,
  getSlackAgentStatus,
} from "./service";

const browserMutation = protectedProcedureWithoutTracing.use(
  ({ ctx, next }) => {
    if (ctx.headers.origin !== getProductBaseUrl().origin) {
      throw new ForbiddenError("Request must originate from Langfuse");
    }
    return next();
  },
);

export const slackAgentRouter = createTRPCRouter({
  status: protectedProcedureWithoutTracing.query(({ ctx }) =>
    getSlackAgentStatus(ctx.session.user.id),
  ),
  createCode: browserMutation.mutation(({ ctx }) =>
    createSlackAgentCode(ctx.session.user.id),
  ),
  confirmConnection: browserMutation
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }))
    .mutation(({ ctx, input }) =>
      confirmSlackAgentConnection({
        token: input.token,
        userId: ctx.session.user.id,
      }),
    ),
  disconnect: browserMutation
    .input(z.object({ linkId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      disconnectSlackAgent(ctx.session.user.id, input.linkId),
    ),
});
