import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

import { type Observation, Prisma } from "@prisma/client";
import { paginationZod } from "@/src/utils/zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import {
  datetimeFilterToPrismaSql,
  filterToPrismaSql,
} from "@/src/features/filters/server/filterToPrisma";
import {
  type ObservationOptions,
  observationsTableCols,
} from "@/src/server/api/definitions/observationsTable";

const exportFileFormats = ["CSV", "JSON", "OPENAI-JSONL"] as const;
export type ExportFileFormats = (typeof exportFileFormats)[number];

const GenerationFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable(),
});

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
      const searchCondition = input.searchQuery
        ? Prisma.sql`AND (
        o."id" ILIKE ${`%${input.searchQuery}%`} OR
        o."name" ILIKE ${`%${input.searchQuery}%`} OR
        o."model" ILIKE ${`%${input.searchQuery}%`} OR
        t."name" ILIKE ${`%${input.searchQuery}%`}
      )`
        : Prisma.empty;

      const filterCondition = filterToPrismaSql(
        input.filter ?? [],
        observationsTableCols,
      );

      // to improve query performance, add timeseries filter to observation queries as well
      const startTimeFilter = input.filter?.find(
        (f) => f.column === "start_time" && f.type === "datetime",
      );
      const datetimeFilter =
        startTimeFilter && startTimeFilter.type === "datetime"
          ? datetimeFilterToPrismaSql(
              "start_time",
              startTimeFilter.operator,
              startTimeFilter.value,
            )
          : Prisma.empty;

      const generations = await ctx.prisma.$queryRaw<
        Array<
          Observation & {
            traceId: string;
            traceName: string;
            totalCount: number;
            latency: number | null;
          }
        >
      >(
        Prisma.sql`
          WITH observations_with_latency AS (
            SELECT
              o.*,
              CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END AS "latency"
            FROM observations o
            WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            ${datetimeFilter}
          )
          SELECT
            o.id,
            o.name,
            o.model,
            o.start_time as "startTime",
            o.end_time as "endTime",
            o.latency,
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
          FROM observations_with_latency o
          JOIN traces t ON t.id = o.trace_id
          WHERE
            t.project_id = ${input.projectId}
            ${searchCondition}
            ${filterCondition}
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
      const searchCondition = input.searchQuery
        ? Prisma.sql`AND (
        o."id" ILIKE ${`%${input.searchQuery}%`} OR
        o."name" ILIKE ${`%${input.searchQuery}%`} OR
        o."model" ILIKE ${`%${input.searchQuery}%`} OR
        t."name" ILIKE ${`%${input.searchQuery}%`}
      )`
        : Prisma.empty;

      const filterCondition = filterToPrismaSql(
        input.filter ?? [],
        observationsTableCols,
      );
      console.log("filters: ", filterCondition);

      const generations = await ctx.prisma.$queryRaw<
        Array<
          Observation & {
            traceId: string;
            traceName: string;
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
            o.version
          FROM observations o
          JOIN traces t ON t.id = o.trace_id
          WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            AND t.project_id = ${input.projectId}
            ${searchCondition}
            ${filterCondition}
          ORDER BY o.start_time DESC
        `,
      );

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
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const queryFilter = {
        projectId: input.projectId,
        type: "GENERATION",
      } as const;

      const [model, name, traceName] = await Promise.all([
        ctx.prisma.observation.groupBy({
          by: ["model"],
          where: queryFilter,
          _count: { _all: true },
        }),
        ctx.prisma.observation.groupBy({
          by: ["name"],
          where: queryFilter,
          _count: { _all: true },
        }),
        ctx.prisma.$queryRaw<
          Array<{
            traceName: string | null;
            count: number;
          }>
        >(Prisma.sql`
        SELECT
          t.name "traceName",
          count(*)::int AS count
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
        GROUP BY 1
      `),
      ]);
      // typecheck filter options, needs to include all columns with options
      const res: ObservationOptions = {
        model: model
          .filter((i) => i.model !== null)
          .map((i) => ({
            value: i.model as string,
            count: i._count._all,
          })),
        name: name
          .filter((i) => i.name !== null)
          .map((i) => ({
            value: i.name as string,
            count: i._count._all,
          })),
        traceName: traceName
          .filter((i) => i.traceName !== null)
          .map((i) => ({
            value: i.traceName as string,
            count: i.count,
          })),
      };
      return res;
    }),
});
