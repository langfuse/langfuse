import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Generation } from "@/src/utils/types";

const exportFileFormats = ["csv", "json"] as const;
export type ExportFileFormats = (typeof exportFileFormats)[number];

const GenerationFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
  name: z.array(z.string()).nullable(),
  model: z.array(z.string()).nullable(),
});

// extend generationfilteroptions with export options
const ExportOptions = GenerationFilterOptions.extend({
  fileFormat: z.enum(exportFileFormats),
});

export const generationsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(GenerationFilterOptions)
    .query(async ({ input, ctx }) => {
      const generations = (await ctx.prisma.observation.findMany({
        where: {
          type: "GENERATION",
          projectId: input.projectId,
          ...(input.name
            ? {
                name: {
                  in: input.name,
                },
              }
            : undefined),
          ...(input.model
            ? {
                model: {
                  in: input.model,
                },
              }
            : undefined),
          traceId: {
            not: null,
            ...(input.traceId
              ? {
                  in: input.traceId,
                }
              : undefined),
          },
        },
        orderBy: {
          startTime: "desc",
        },
        take: 100,
      })) as Array<
        Generation & {
          traceId: string;
        }
      >;

      return generations;
    }),

  export: protectedProjectProcedure
    .input(ExportOptions)
    .query(async ({ input, ctx }) => {
      const generations = (await ctx.prisma.observation.findMany({
        where: {
          type: "GENERATION",
          projectId: input.projectId,
          ...(input.name
            ? {
                name: {
                  in: input.name,
                },
              }
            : undefined),
          ...(input.model
            ? {
                model: {
                  in: input.model,
                },
              }
            : undefined),
          traceId: {
            not: null,
            ...(input.traceId
              ? {
                  in: input.traceId,
                }
              : undefined),
          },
        },
        orderBy: {
          startTime: "desc",
        },
        take: 100,
      })) as Array<
        Generation & {
          traceId: string;
        }
      >;

      // create csv
      if (input.fileFormat === "csv") {
        const csv = [
          [
            "traceId",
            "name",
            "model",
            "startTime",
            "endTime",
            "prompt",
            "completion",
            "metadata",
          ],
        ]
          .concat(
            generations.map((generation) =>
              [
                generation.traceId,
                generation.name ?? "",
                generation.model ?? "",
                generation.startTime.toISOString(),
                generation.endTime?.toISOString() ?? "",
                JSON.stringify(generation.input),
                JSON.stringify(generation.output),
                JSON.stringify(generation.metadata),
              ].map((field) => {
                const str = typeof field === "string" ? field : String(field);
                return `"${str.replace(/"/g, '""')}"`;
              }),
            ),
          )
          .map((row) => row.join(","))
          .join("\n");

        return csv;
      } else if (input.fileFormat === "json") {
        return JSON.stringify(generations);
      }
    }),

  availableFilterOptions: protectedProjectProcedure
    .input(GenerationFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        projectId: input.projectId,
        ...(input.name
          ? {
              name: {
                in: input.name,
              },
            }
          : undefined),
        ...(input.model
          ? {
              model: {
                in: input.model,
              },
            }
          : undefined),
        ...(input.traceId
          ? {
              traceId: { in: input.traceId },
            }
          : undefined),
      };

      const traceIds = await ctx.prisma.observation.groupBy({
        where: {
          type: "GENERATION",
          ...filter,
        },
        by: ["traceId"],
        _count: {
          _all: true,
        },
      });

      const names = await ctx.prisma.observation.groupBy({
        where: {
          type: "GENERATION",
          ...filter,
        },
        by: ["name"],
        _count: {
          _all: true,
        },
      });

      const models = await ctx.prisma.observation.groupBy({
        where: {
          type: "GENERATION",
          ...filter,
        },
        by: ["model"],
        _count: {
          _all: true,
        },
      });

      return [
        {
          key: "traceId",
          occurrences: traceIds
            .filter((i) => i.traceId !== null)
            .map((i) => {
              return { key: i.traceId ?? "null", count: i._count };
            }),
        },
        {
          key: "name",
          occurrences: names
            .filter((i) => i.name !== null)
            .map((i) => {
              return { key: i.name ?? "null", count: i._count };
            }),
        },
        {
          key: "model",
          occurrences: models
            .filter((i) => i.model !== null)
            .map((i) => {
              return { key: i.model ?? "null", count: i._count };
            }),
        },
      ];
    }),

  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    // also works for other observations
    const generation = (await ctx.prisma.observation.findFirstOrThrow({
      where: {
        id: input,
        type: "GENERATION",
        Project: {
          members: {
            some: {
              userId: ctx.session.user.id,
            },
          },
        },
      },
    })) as Generation;

    const scores = generation.traceId
      ? await ctx.prisma.score.findMany({
          where: {
            traceId: generation.traceId,
          },
        })
      : [];

    return { ...generation, scores };
  }),
});
