import { z } from "zod";
import {
  MAX_AGENT_NAME_LENGTH,
  singleFilterList,
  type AgentListResult,
  type FilterCondition,
} from "@langfuse/shared";
import {
  getAgentMapSkeleton,
  getAgentMetricsFromEventsTable,
  getAgentSkillsFromEventsTable,
  getAgentStatsFromEventsTable,
  getAgentsCountFromEventsTable,
  getAgentsFromEventsTable,
  hasAnyAgentFromEventsTable,
} from "@langfuse/shared/src/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const agentName = z
  .string()
  .min(1)
  .refine((name) => name.trim().length > 0, {
    message: "Agent names must contain text.",
  })
  .refine((name) => Array.from(name).length <= MAX_AGENT_NAME_LENGTH, {
    message: `Agent names support at most ${MAX_AGENT_NAME_LENGTH} Unicode characters.`,
  });

function supportedFilter(filter: FilterCondition): boolean {
  if (["Environment", "environment"].includes(filter.column)) {
    if (filter.type === "string") return filter.value.length <= 200;
    return (
      filter.type === "stringOptions" &&
      filter.value.length <= 100 &&
      filter.value.every((value) => value.length <= 200)
    );
  }
  return (
    ["Timestamp", "timestamp", "Start Time", "startTime"].includes(
      filter.column,
    ) && filter.type === "datetime"
  );
}

const agentScope = z.object({
  projectId: z.string().min(1),
  from: z.date(),
  to: z.date(),
  filter: singleFilterList
    .nullable()
    .optional()
    .refine(
      (filters) =>
        !filters || (filters.length <= 20 && filters.every(supportedFilter)),
      {
        message:
          "Agent filters support only time and environment (up to 20 conditions).",
      },
    ),
});

const validWindow = (scope: { from: Date; to: Date }) => scope.from <= scope.to;
const windowError = {
  message: "The start of the time window must be before its end.",
  path: ["from"],
};
const namedAgentScope = agentScope
  .extend({ agentName })
  .refine(validWindow, windowError);

export const agentsRouter = createTRPCRouter({
  hasAnyFromEvents: protectedProjectProcedure
    .input(agentScope.refine(validWindow, windowError))
    .query(({ input }) => hasAnyAgentFromEventsTable(input)),

  allFromEvents: protectedProjectProcedure
    .input(
      agentScope
        .extend({
          page: z.number().int().min(0).max(1_000_000),
          limit: z.number().int().min(1).max(100),
          searchQuery: z
            .string()
            .refine(
              (search) => Array.from(search).length <= MAX_AGENT_NAME_LENGTH,
            )
            .optional(),
        })
        .refine(validWindow, windowError),
    )
    .query(async ({ input, ctx }): Promise<AgentListResult> => {
      const scope = { ...input, projectId: ctx.session.projectId };
      const [agents, totalAgents] = await Promise.all([
        getAgentsFromEventsTable({
          ...scope,
          offset: input.page * input.limit,
        }),
        getAgentsCountFromEventsTable(scope),
      ]);
      return { agents, totalAgents };
    }),

  metricsFromEvents: protectedProjectProcedure
    .input(
      agentScope
        .extend({ agentNames: z.array(agentName).max(100) })
        .refine(validWindow, windowError),
    )
    .query(({ input }) => getAgentMetricsFromEventsTable(input)),

  byNameFromEvents: protectedProjectProcedure
    .input(namedAgentScope)
    .query(({ input }) => getAgentStatsFromEventsTable(input)),

  skillsFromEvents: protectedProjectProcedure
    .input(namedAgentScope)
    .query(({ input }) => getAgentSkillsFromEventsTable(input)),

  mapSkeletonFromEvents: protectedProjectProcedure
    .input(namedAgentScope)
    .query(({ input }) => getAgentMapSkeleton(input)),
});
