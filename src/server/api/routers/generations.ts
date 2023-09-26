import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { type Generation } from "@/src/utils/types";
import { type Observation, Prisma } from "@prisma/client";
import { paginationZod } from "@/src/utils/zod";

const exportFileFormats = ["CSV", "JSON", "OPENAI-JSONL"] as const;
export type ExportFileFormats = (typeof exportFileFormats)[number];

const GenerationFilterOptions = z.object({
  traceId: z.array(z.string()).nullable(),
  projectId: z.string(), // Required for protectedProjectProcedure
  name: z.array(z.string()).nullable(),
  model: z.array(z.string()).nullable(),
  traceName: z.array(z.string()).nullable(),
  searchQuery: z.string().nullable(),
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

  const traceNameCondition =
    filter.traceName !== null
      ? Prisma.sql`AND t.name IN (${Prisma.join(filter.traceName)})`
      : Prisma.empty;

  const searchCondition = filter.searchQuery
    ? Prisma.sql`AND (
        o."id" ILIKE ${`%${filter.searchQuery}%`} OR 
        o."name" ILIKE ${`%${filter.searchQuery}%`} OR 
        o."model" ILIKE ${`%${filter.searchQuery}%`} OR 
        t."name" ILIKE ${`%${filter.searchQuery}%`}
      )`
    : Prisma.empty;

  return Prisma.join(
    [
      traceIdCondition,
      nameCondition,
      modelCondition,
      traceNameCondition,
      searchCondition,
    ],
    " ",
  );
};

const ListInputs = GenerationFilterOptions.extend({
  ...paginationZod,
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
        Array<
          Observation & {
            traceId: string;
            traceName: string;
            totalCount: number;
          }
        >
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
            t.name as "traceName",
            o.completion_start_time as "completionStartTime",
            o.prompt_tokens as "promptTokens",
            o.completion_tokens as "completionTokens",
            o.total_tokens as "totalTokens",
            o.version,
            (count(*) OVER())::int AS "totalCount"
          FROM observations o
          JOIN traces t ON t.id = o.trace_id
          WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            AND t.project_id = ${input.projectId}
            ${generationsFilterPrismaCondition(input)}
          ORDER BY o.start_time DESC
          LIMIT ${input.limit}
          OFFSET ${input.page * input.limit}
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
      const [traceIds, names, models, traceNames] = await Promise.all([
        ctx.prisma.$queryRaw<
          Array<{
            traceId: string | null;
            count: number;
          }>
        >(Prisma.sql`
        SELECT
          t.id as "traceId",
          count(*)::int AS count
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
          ${generationsFilterPrismaCondition(input)}
        GROUP BY 1
      `),
        ctx.prisma.$queryRaw<
          Array<{
            name: string | null;
            count: number;
          }>
        >(Prisma.sql`
        SELECT
          o.name,
          count(*)::int AS count
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
          ${generationsFilterPrismaCondition(input)}
        GROUP BY 1
      `),
        ctx.prisma.$queryRaw<
          Array<{
            model: string | null;
            count: number;
          }>
        >(Prisma.sql`
        SELECT
          o.model,
          count(*)::int AS count
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
          ${generationsFilterPrismaCondition(input)}
        GROUP BY 1
      `),
        ctx.prisma.$queryRaw<
          Array<{
            name: string | null;
            count: number;
          }>
        >(Prisma.sql`
        SELECT
          t.name,
          count(*)::int AS count
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
          ${generationsFilterPrismaCondition(input)}
        GROUP BY 1
      `),
      ]);

      return [
        {
          key: "traceId",
          occurrences: traceIds
            .filter((i) => i.traceId !== null)
            .map((i) => {
              return { key: i.traceId ?? "null", count: i.count };
            }),
        },
        {
          key: "name",
          occurrences: names
            .filter((i) => i.name !== null)
            .map((i) => {
              return { key: i.name ?? "null", count: i.count };
            }),
        },
        {
          key: "model",
          occurrences: models
            .filter((i) => i.model !== null)
            .map((i) => {
              return { key: i.model ?? "null", count: i.count };
            }),
        },
        {
          key: "traceName",
          occurrences: traceNames
            .filter((i) => i.name !== null)
            .map((i) => {
              return { key: i.name ?? "null", count: i.count };
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
        project: {
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
