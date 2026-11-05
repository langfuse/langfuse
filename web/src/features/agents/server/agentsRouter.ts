import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { AGENT_LIMITS } from "@langfuse/shared/agents";
import {
  listAgents,
  getAgentDetail,
  getAgentEnvironments,
  getAgentRuns,
  getAgentTraces,
  getAgentSkills,
  getAgentInfo,
} from "@langfuse/shared/agents/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  requireV4Writes,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { canViewAgents } from "../agentsAccess";
import { resolveManagedSkills } from "./resolveManagedSkills";

const windowInput = z
  .object({
    projectId: z.string().min(1),
    from: z.date(),
    to: z.date(),
  })
  .refine(({ from, to }) => {
    const duration = to.getTime() - from.getTime();
    return duration > 0 && duration <= AGENT_LIMITS.maxWindowDays * 86_400_000;
  }, "Select a time range of at most 30 days.");
const scopeInput = windowInput.safeExtend({
  environment: z.string().max(256).nullable(),
});
const identityInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("id"),
    value: z.string().min(1).max(AGENT_LIMITS.idLength),
  }),
  z.object({
    kind: z.literal("name"),
    value: z.string().min(1).max(AGENT_LIMITS.nameLength),
  }),
]);
const detailInput = scopeInput.safeExtend({ identity: identityInput });
const pagination = {
  page: z.number().int().min(0).max(AGENT_LIMITS.maxPage).default(0),
  pageSize: z.number().int().min(1).max(AGENT_LIMITS.pageSize).default(20),
};
const agentProcedure = protectedProjectProcedure
  .use(requireV4Writes)
  .input(z.object({ projectId: z.string() }))
  .use(({ ctx, input, next }) => {
    if (!canViewAgents(ctx.session, input.projectId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agents is not available.",
      });
    }
    return next();
  });

export const agentsRouter = createTRPCRouter({
  list: agentProcedure
    .input(
      scopeInput.safeExtend({
        ...pagination,
        search: z.string().max(200).optional(),
        sort: z.enum(["lastSeen", "runs", "cost", "name"]).default("lastSeen"),
        direction: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(({ input }) => listAgents(input)),
  environments: agentProcedure
    .input(windowInput)
    .query(({ input }) => getAgentEnvironments(input)),
  detail: agentProcedure
    .input(detailInput)
    .query(({ input }) => getAgentDetail(input)),
  runs: agentProcedure
    .input(detailInput.safeExtend(pagination))
    .query(({ input }) => getAgentRuns(input)),
  traces: agentProcedure
    .input(detailInput.safeExtend(pagination))
    .query(({ input }) => getAgentTraces(input)),
  info: agentProcedure
    .input(detailInput)
    .query(({ input }) => getAgentInfo(input)),
  skills: agentProcedure
    .input(detailInput.safeExtend(pagination))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "skills:read",
      });
      const result = await getAgentSkills(input);
      return {
        ...result,
        items: await resolveManagedSkills(
          ctx.prisma,
          input.projectId,
          result.items,
        ),
      };
    }),
});
