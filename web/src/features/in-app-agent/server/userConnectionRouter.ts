import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedureWithoutTracing,
} from "@/src/server/api/trpc";
import { confirmAgentUserConnection } from "./userConnectionService";

const ConnectionToken = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export const agentUserConnectionsRouter = createTRPCRouter({
  confirm: protectedProcedureWithoutTracing
    .input(ConnectionToken)
    .mutation(({ input, ctx }) =>
      confirmAgentUserConnection({
        token: input.token,
        userId: ctx.session.user.id,
      }),
    ),
});
