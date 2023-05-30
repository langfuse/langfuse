import { type NestedObservation } from "@/src/utils/types";
import { type Observation } from "@prisma/client";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  attribute: z
    .object({
      path: z.array(z.string()).optional(),
      equals: z.string().optional(),
      string_contains: z.string().optional(),
      string_starts_with: z.string().optional(),
      string_ends_with: z.string().optional(),
    })
    .nullable(),
  name: z.array(z.string()).nullable(),
  id: z.array(z.string()).nullable(),
  status: z.array(z.string()).nullable(),
});

export const traceRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const traces = await ctx.prisma.trace.findMany({
        where: {
          projectId: input.projectId,
          ...(input.attribute?.path
            ? {
                attributes: input.attribute,
              }
            : undefined),
          ...(input.name
            ? {
                name: {
                  in: input.name,
                },
              }
            : undefined),
          ...(input.id
            ? {
                id: {
                  in: input.id,
                },
              }
            : undefined),
          ...(input.status
            ? {
                status: {
                  in: input.status,
                },
              }
            : undefined),
        },
        orderBy: {
          timestamp: "desc",
        },
        include: {
          scores: true,
          observations: true,
        },
      });
      return traces.map((trace) => ({
        ...trace,
        nestedObservation: nestObservations(trace.observations),
      }));
    }),
  availableFilterOptions: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        projectId: input.projectId,
        ...(input.attribute?.path
          ? {
              attributes: input.attribute,
            }
          : undefined),
        ...(input.name
          ? {
              name: {
                in: input.name,
              },
            }
          : undefined),
        ...(input.id
          ? {
              id: {
                in: input.id,
              },
            }
          : undefined),
        ...(input.status
          ? {
              status: {
                in: input.status,
              },
            }
          : undefined),
      };

      const [ids, names, statuses] = await Promise.all([
        ctx.prisma.trace.groupBy({
          where: filter,
          by: ["id"],
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

        ctx.prisma.trace.groupBy({
          where: filter,
          by: ["status"],
          _count: {
            _all: true,
          },
        }),
      ]);

      return [
        {
          key: "id",
          occurrences: ids.map((i) => {
            return { key: i.id, count: i._count };
          }),
        },
        {
          key: "name",
          occurrences: names.map((i) => {
            return { key: i.name, count: i._count };
          }),
        },
        {
          key: "status",
          occurrences: statuses.map((i) => {
            return { key: i.status, count: i._count };
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

function nestObservations(list: Observation[]): NestedObservation | null {
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

  // Step 4: Assert that there is only one root.
  if (roots.size > 1)
    console.error("Expected exactly one root, but got:", roots.size);
  if (roots.size === 0) return null;

  // Step 5: Return the root.
  return Array.from(roots.values())[0] as NestedObservation;
}
