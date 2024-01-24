import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

import { Prisma, type ObservationView } from "@prisma/client";
import { jsonSchema, paginationZod } from "@/src/utils/zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import {
  datetimeFilterToPrismaSql,
  filterToPrismaSql,
} from "@/src/features/filters/server/filterToPrisma";
import {
  type ObservationOptions,
  observationsTableCols,
} from "@/src/server/api/definitions/observationsTable";
import { usdFormatter } from "@/src/utils/numbers";
import { env } from "@/src/env.mjs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  exportFileFormats,
  exportOptions,
} from "@/src/server/api/interfaces/exportTypes";
import { orderBy } from "@/src/server/api/interfaces/orderBy";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";

const GenerationFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  searchQuery: z.string().nullable(),
});

const ListInputs = GenerationFilterOptions.extend({
  orderBy: orderBy,
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
        input.filter,
        observationsTableCols,
      );

      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        observationsTableCols,
      );

      // to improve query performance, add timeseries filter to observation queries as well
      const startTimeFilter = input.filter.find(
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
          ObservationView & {
            traceId: string;
            traceName: string;
            latency: number | null;
          }
        >
      >(
        Prisma.sql`
          WITH observations_with_latency AS (
            SELECT
              o.*,
              CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END AS "latency"
            FROM observations_view o
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
            o.level,
            o.status_message as "statusMessage",
            o.version,
            o.model_id as "modelId",
            o.input_price as "inputPrice",
            o.output_price as "outputPrice",
            o.total_price as "totalPrice",
            o.calculated_input_cost as "calculatedInputCost",
            o.calculated_output_cost as "calculatedOutputCost",
            o.calculated_total_cost as "calculatedTotalCost"
          FROM observations_with_latency o
          JOIN traces t ON t.id = o.trace_id
          WHERE
            t.project_id = ${input.projectId}
            ${searchCondition}
            ${filterCondition}
          ${orderByCondition}
          LIMIT ${input.limit}
          OFFSET ${input.page * input.limit}
        `,
      );

      const totalGenerations = await ctx.prisma.$queryRaw<
        Array<{ count: bigint }>
      >(
        Prisma.sql`
          WITH observations_with_latency AS (
            SELECT
              o.*,
              CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END AS "latency"
            FROM observations_view o
            WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            ${datetimeFilter}
          )
          SELECT
            count(*)
          FROM observations_with_latency o
          JOIN traces t ON t.id = o.trace_id
          WHERE
            t.project_id = ${input.projectId}
            ${searchCondition}
            ${filterCondition}
        `,
      );

      const count = totalGenerations[0]?.count;
      return {
        totalCount: count ? Number(count) : undefined,
        generations: generations,
      };
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
        input.filter,
        observationsTableCols,
      );
      console.log("filters: ", filterCondition);

      const generations = await ctx.prisma.$queryRaw<
        Array<
          ObservationView & {
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
            o.version,
            o.model_id as "modelId",
            o.input_price as "inputPrice",
            o.output_price as "outputPrice",
            o.total_price as "totalPrice",
            o.calculated_input_cost as "calculatedInputCost",
            o.calculated_output_cost as "calculatedOutputCost",
            o.calculated_total_cost as "calculatedTotalCost"
          FROM observations_view o
          JOIN traces t ON t.id = o.trace_id
          WHERE o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            AND t.project_id = ${input.projectId}
            ${searchCondition}
            ${filterCondition}
          ORDER BY o.start_time DESC
        `,
      );

      let output: string = "";

      // create file
      switch (input.fileFormat) {
        case "CSV":
          output = [
            [
              "traceId",
              "name",
              "model",
              "startTime",
              "endTime",
              "cost",
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
                  generation.calculatedTotalCost
                    ? usdFormatter(
                        generation.calculatedTotalCost.toNumber(),
                        2,
                        8,
                      )
                    : "",
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
          break;
        case "JSON":
          output = JSON.stringify(generations);
          break;
        case "OPENAI-JSONL":
          const inputSchemaOpenAI = z.array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string(),
            }),
          );
          const outputSchema = z
            .object({
              completion: jsonSchema,
            })
            .or(jsonSchema);
          output = generations
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
                            content:
                              typeof generation.parsedOutput.data ===
                                "object" &&
                              "completion" in generation.parsedOutput.data
                                ? JSON.stringify(
                                    generation.parsedOutput.data.completion,
                                  )
                                : JSON.stringify(generation.parsedOutput.data),
                          },
                        ]
                      : [],
                  )
                : [],
            )
            // to jsonl
            .map((row) => JSON.stringify(row))
            .join("\n");

          break;
        default:
          throw new Error("Invalid export file format");
      }

      const fileName = `lf-export-${
        input.projectId
      }-${new Date().toISOString()}.${
        exportOptions[input.fileFormat].extension
      }`;

      if (
        env.S3_BUCKET_NAME &&
        env.S3_ACCESS_KEY_ID &&
        env.S3_SECRET_ACCESS_KEY &&
        env.S3_ENDPOINT &&
        env.S3_REGION
      ) {
        const client = new S3Client({
          credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          },
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
        });
        await client.send(
          new PutObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: fileName,
            Body: output,
            ContentType: exportOptions[input.fileFormat].fileType,
            Expires: new Date(Date.now() + 60 * 60 * 1000), // in 1 hour, file will be deleted
          }),
        );
        const signedUrl = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: fileName,
            ResponseContentDisposition: `attachment; filename="${fileName}"`,
          }),
          {
            expiresIn: 60 * 60, // in 1 hour, signed url will expire
          },
        );
        return {
          type: "s3",
          url: signedUrl,
          fileName,
        } as const;
      } else {
        return {
          type: "data",
          data: output,
          fileName,
        } as const;
      }
    }),
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const queryFilter = {
        projectId: input.projectId,
        type: "GENERATION",
      } as const;

      const model = await ctx.prisma.observation.groupBy({
        by: ["model"],
        where: queryFilter,
        _count: { _all: true },
      });
      const name = await ctx.prisma.observation.groupBy({
        by: ["name"],
        where: queryFilter,
        _count: { _all: true },
      });
      const traceName = await ctx.prisma.$queryRaw<
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
      `);

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
