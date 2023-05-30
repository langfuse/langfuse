import { type NestedObservation } from "@/src/utils/types";
import { type Observation } from "@prisma/client";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { prisma } from "~/server/db";

const FilterOptions = z.object({
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

// const FilterOptions = z
//   .object({
//     key: z.string(),
//     filter: z.discriminatedUnion("type", [
//       z.object({
//         type: z.literal('match'),
//         value: z.array(z.string())
//       }),
//       z.object({
//         type: z.literal('string-compare'),
//         value: z.object({
//         path: z.array(z.string()).optional(),
//         equals: z.string().optional(),
//         string_contains: z.string().optional(),
//         string_starts_with: z.string().optional(),
//         string_ends_with: z.string().optional(),
//         }),
//       })
//     ]),
//   })
//   .array();

export const traceRouter = createTRPCRouter({
  all: publicProcedure.input(FilterOptions).query(async ({ input }) => {
    console.log(input);

    const traces = await prisma.trace.findMany({
      where: {
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

  availableFilterOptions: publicProcedure
    .input(FilterOptions)
    .query(async ({ input }) => {
      const [ids, names, statuses] = await Promise.all([
        await prisma.trace.groupBy({
          where: {
            ...(input.id
              ? {
                  id: {
                    in: input.id,
                  },
                }
              : undefined),
          },
          by: ["id"],
          _count: {
            _all: true,
          },
        }),

        await prisma.trace.groupBy({
          where: {
            ...(input.name
              ? {
                  name: {
                    in: input.name,
                  },
                }
              : undefined),
          },
          by: ["name"],
          _count: {
            _all: true,
          },
        }),

        await prisma.trace.groupBy({
          where: {
            ...(input.status
              ? {
                  status: {
                    in: input.status,
                  },
                }
              : undefined),
          },
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

  byId: publicProcedure.input(z.string()).query(async ({ input }) => {
    const [trace, observations] = await Promise.all([
      prisma.trace.findUniqueOrThrow({
        where: {
          id: input,
        },
        include: {
          scores: true,
        },
      }),
      prisma.observation.findMany({
        where: {
          traceId: input,
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
