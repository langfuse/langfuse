import { z } from "zod";

import { env } from "@/src/env.mjs";
import {
  datetimeFilterToPrismaSql,
  filterToPrismaSql,
} from "@/src/features/filters/server/filterToPrisma";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { observationsTableCols } from "@/src/server/api/definitions/observationsTable";
import {
  exportFileFormats,
  exportOptions,
} from "@/src/server/api/interfaces/exportTypes";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type ObservationView, Prisma } from "@prisma/client";

import { GenerationTableOptions } from "../utils/GenerationTableOptions";
import { mutateGenerationsInPlaceToCSV } from "@/src/server/api/routers/generations/exportQuery/mutateGenerationsInPlaceToCSV";
import { mutateGenerationsInPlaceToJSONL } from "@/src/server/api/routers/generations/exportQuery/mutateGenerationsInPlaceToJSONL";

const GenerationsExportInputs = GenerationTableOptions.extend({
  fileFormat: z.enum(exportFileFormats),
});

export const generationsExportQuery = protectedProjectProcedure
  .input(GenerationsExportInputs)
  .query(async ({ input, ctx }) => {
    // ATTENTION: When making changes to this query, make sure to also update the all query
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

    const allGenerations = await ctx.prisma.$queryRaw<
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
      ),
      -- used for filtering
      scores_avg AS (
        SELECT
          trace_id,
          observation_id,
          jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
        FROM (
          SELECT
            trace_id,
            observation_id,
            name,
            avg(value) avg_value
          FROM
            scores
          GROUP BY
            1,
            2,
            3
          ORDER BY
            1) tmp
        GROUP BY
          1, 2
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
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      WHERE
        t.project_id = ${input.projectId}
        ${searchCondition}
        ${filterCondition}
        ${orderByCondition}
    `,
    );

    let output: string = "";

    // Create file string
    switch (input.fileFormat) {
      case "CSV":
        output = mutateGenerationsInPlaceToCSV(allGenerations);
        break;
      case "JSON":
        // This operation is not yet memory optimized to mutate the generations in place
        output = JSON.stringify(allGenerations);
        break;
      case "OPENAI-JSONL":
        output = mutateGenerationsInPlaceToJSONL(allGenerations);

        break;
      default:
        throw new Error("Invalid export file format");
    }

    const fileDate = new Date().toISOString();
    const fileExtension = exportOptions[input.fileFormat].extension;
    const fileName = `lf-export-${input.projectId}-${fileDate}.${fileExtension}`;

    // Upload to S3 if credentials are provided
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
    }

    // Fallback to returning the file as a data in HTTP response
    return {
      type: "data",
      data: output,
      fileName,
    } as const;
  });
