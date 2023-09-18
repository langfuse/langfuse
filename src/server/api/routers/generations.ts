import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Generation } from "@/src/utils/types";
import { type Observation, Prisma } from "@prisma/client";

const exportFileFormats = ["CSV", "JSON", "OPENAI-JSONL"] as const;
export type ExportFileFormats = (typeof exportFileFormats)[number];

const GenerationFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
  name: z.array(z.string()).nullable(),
  model: z.array(z.string()).nullable(),
});

const generationsFilterPrismaCondition = (
  filter: z.infer<typeof GenerationFilterOptions>,
) => {
  const traceIdCondition =
    filter.traceId !== null
      ? Prisma.sql`AND o.trace_id IN (${Prisma.join(filter.traceId)})`
      : Prisma.empty;

  const nameCondition =
    filter.name !== null
      ? Prisma.sql`AND o.name IN (${Prisma.join(filter.name)})`
      : Prisma.empty;

  const modelCondition =
    filter.model !== null
      ? Prisma.sql`AND o.model IN (${Prisma.join(filter.model)})`
      : Prisma.empty;

  return Prisma.join([traceIdCondition, nameCondition, modelCondition], " ");
};

const ListInputs = GenerationFilterOptions.extend({
  pageIndex: z.number().int().gte(0).nullable().default(0),
  pageSize: z.number().int().gte(0).lte(100).nullable().default(50),
});

// extend generationfilteroptions with export options
const ExportInputs = GenerationFilterOptions.extend({
  fileFormat: z.enum(exportFileFormats),
});

export const generationsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ListInputs)
    .query(async ({ input, ctx }) => {
      const generations = await ctx.prisma.$queryRaw<
        Array<Observation & { traceId: string; totalCount: number }>
      >(
        Prisma.sql`
          SELECT
            o.id,
            o.name,
            o.model,
            o.start_time as "startTime",
            o.end_time as "endTime",
            o.input,
            o.output,
            o.metadata,
            o.trace_id as "traceId",
            o.completion_start_time as "completionStartTime",
            o.prompt_tokens as "promptTokens",
            o.completion_tokens as "completionTokens",
            o.total_tokens as "totalTokens",
            o.version,
            (count(*) OVER())::int AS "totalCount"
          FROM observations o
          WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            ${generationsFilterPrismaCondition(input)}
          ORDER BY o.start_time DESC
          LIMIT ${input.pageSize ?? 50}
          OFFSET ${(input.pageIndex ?? 0) * (input.pageSize ?? 50)}
        `,
      );

      return generations;
    }),

  export: protectedProjectProcedure
    .input(ExportInputs)
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
      })) as Array<
        Generation & {
          traceId: string;
        }
      >;

      // create csv
      switch (input.fileFormat) {
        case "CSV":
          return [
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
        case "JSON":
          return JSON.stringify(generations);
        case "OPENAI-JSONL":
          const inputSchemaOpenAI = z.array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string(),
            }),
          );
          const outputSchema = z.object({
            completion: z.string(),
          });

          return (
            generations
              .map((generation) => ({
                parsedInput: inputSchemaOpenAI.safeParse(generation.input),
                parsedOutput: outputSchema.safeParse(generation.output),
              }))
              .filter((generation) => generation.parsedInput.success)
              .map((generation) =>
                generation.parsedInput.success // check for typescript validation, is always true due to previous filter
                  ? generation.parsedInput.data.concat(
                      generation.parsedOutput.success
                        ? [
                            {
                              role: "assistant",
                              content: generation.parsedOutput.data.completion,
                            },
                          ]
                        : [],
                    )
                  : [],
              )
              // to jsonl
              .map((row) => JSON.stringify(row))
              .join("\n")
          );
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
