import { type NestedObservation } from "@/src/utils/types";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Observation } from "@prisma/client";

const ScoreFilter = z.object({
  name: z.string(),
  operator: z.enum(["lt", "gt", "equals", "lte", "gte"]),
  value: z.number(),
});

type ScoreFilter = z.infer<typeof ScoreFilter>;

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  name: z.array(z.string()).nullable(),
  scores: ScoreFilter.nullable(),
  searchQuery: z.string().nullable(),
});

export const traceRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      return await ctx.prisma.trace.findMany({
        where: {
          AND: [
            {
              projectId: input.projectId,
              ...(input.name ? { name: { in: input.name } } : undefined),
              ...(input.scores
                ? { scores: { some: createScoreCondition(input.scores) } }
                : undefined),
            },
            {
              OR: [
                {
                  id: input.searchQuery
                    ? { contains: input.searchQuery }
                    : undefined,
                },
                {
                  externalId: input.searchQuery
                    ? { contains: input.searchQuery }
                    : undefined,
                },
                {
                  userId: input.searchQuery
                    ? { contains: input.searchQuery }
                    : undefined,
                },
                {
                  name: input.searchQuery
                    ? { contains: input.searchQuery }
                    : undefined,
                },
              ],
            },
          ],
        },
        orderBy: {
          timestamp: "desc",
        },
        include: {
          scores: true,
        },
        take: 50, // TODO: pagination
      });
    }),
  availableFilterOptions: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        AND: [
          {
            projectId: input.projectId,
            ...(input.name ? { name: { in: input.name } } : undefined),
            ...(input.scores
              ? { scores: { some: createScoreCondition(input.scores) } }
              : undefined),
          },
          {
            OR: [
              {
                id: input.searchQuery
                  ? { contains: input.searchQuery }
                  : undefined,
              },
              {
                externalId: input.searchQuery
                  ? { contains: input.searchQuery }
                  : undefined,
              },
              {
                userId: input.searchQuery
                  ? { contains: input.searchQuery }
                  : undefined,
              },
            ],
          },
        ],
      };

      const [scores, names] = await Promise.all([
        ctx.prisma.score.groupBy({
          where: {
            trace: filter,
          },
          by: ["name", "traceId"],
          _count: {
            _all: true,
          },
        }),
        ctx.prisma.trace.groupBy({
          where: filter,
          by: ["name"],
          _count: {
            _all: true,
          },
        }),
      ]);

      let groupedCounts: Map<string, number> = new Map();

      for (const item of scores) {
        const current = groupedCounts.get(item.name);
        groupedCounts = groupedCounts.set(item.name, current ? current + 1 : 1);
      }

      const scoresArray: { key: string; value: number }[] = [];
      for (const [key, value] of groupedCounts) {
        scoresArray.push({ key, value });
      }

      return [
        {
          key: "name",
          occurrences: names.map((i) => {
            return { key: i.name ?? "undefined", count: i._count };
          }),
        },
        {
          key: "scores",
          occurrences: scoresArray.map((i) => {
            return { key: i.key, count: { _all: i.value } };
          }),
        },
      ];
    }),

  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    const [trace, observations] = await Promise.all([
      ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input,
          project: {
            members: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
        include: {
          scores: true,
        },
      }),
      ctx.prisma.observation.findMany({
        where: {
          traceId: input,
          trace: {
            project: {
              members: {
                some: {
                  userId: ctx.session.user.id,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      ...trace,
      nestedObservation: nestObservations(observations),
    };
  }),
});

function nestObservations(list: Observation[]): NestedObservation[] | null {
  if (list.length === 0) return null;

  // Step 1: Create a map where the keys are object IDs, and the values are
  // the corresponding objects with an added 'children' property.
  const map = new Map<string, NestedObservation>();
  for (const obj of list) {
    map.set(obj.id, { ...obj, children: [] });
  }

  // Step 2: Create another map for the roots of all trees.
  const roots = new Map<string, NestedObservation>();

  // Step 3: Populate the 'children' arrays and root map.
  for (const obj of map.values()) {
    if (obj.parentObservationId) {
      const parent = map.get(obj.parentObservationId);
      if (parent) {
        parent.children.push(obj);
      }
    } else {
      roots.set(obj.id, obj);
    }
  }

  // Step 4: Return the roots.
  return Array.from(roots.values());
}

function createScoreCondition(score: ScoreFilter) {
  let filter = {};
  switch (score.operator) {
    case "lt":
      filter = { lt: score.value };
      break;
    case "gt":
      filter = { gt: score.value };
      break;
    case "equals":
      filter = { equals: score.value };
      break;
    case "lte":
      filter = { lte: score.value };
      break;
    case "gte":
      filter = { gte: score.value };
      break;
  }

  return {
    name: score.name,
    value: filter,
  };
}
