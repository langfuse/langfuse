import { type Transform } from "stream";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { exportFileFormats, exportOptions } from "@langfuse/shared";
import { S3StorageService } from "@/src/server/api/services/S3StorageService";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { type ObservationView } from "@langfuse/shared/src/db";

import { DatabaseReadStream } from "../db/DatabaseReadStream";
import {
  type FullObservations,
  getAllGenerations as getAllGenerations,
} from "../db/getAllGenerationsSqlQuery";
import { GenerationTableOptions } from "../utils/GenerationTableOptions";
import { transformStreamToCsv } from "./transforms/transformStreamToCsv";
import { transformStreamToJson } from "./transforms/transformStreamToJson";
import { transformStreamToJsonLines } from "./transforms/transformStreamToJsonLines";

const generationsExportInput = GenerationTableOptions.extend({
  fileFormat: z.enum(exportFileFormats),
});
export type GenerationsExportInput = z.infer<typeof generationsExportInput>;
export type GenerationsExportResult =
  | {
      type: "s3";
      fileName: string;
      url: string;
    }
  | {
      type: "data";
      fileName: string;
      data: string;
    };

export const generationsExportQuery = protectedProjectProcedure
  .input(generationsExportInput)
  .query<GenerationsExportResult>(async ({ input }) => {
    const queryPageSize = env.DB_EXPORT_PAGE_SIZE ?? 1000;

    const dateCutoffFilter = {
      column: "Start Time",
      operator: "<" as const,
      value: new Date(),
      type: "datetime" as const,
    };

    const dbReadStream = new DatabaseReadStream<ObservationView>(
      async (pageSize: number, offset: number) => {
        const { generations } = await getAllGenerations({
          input: {
            ...input,
            filter: [...input.filter, dateCutoffFilter],
            page: offset / pageSize,
            limit: pageSize,
          },
          selectIO: true, // selecting input/output data
        });
        return generations as unknown as FullObservations;
      },
      queryPageSize,
    );

    const streamTransformations: Record<
      typeof input.fileFormat,
      () => Transform
    > = {
      CSV: transformStreamToCsv,
      JSON: transformStreamToJson,
      "OPENAI-JSONL": transformStreamToJsonLines,
    };
    const transformation = streamTransformations[input.fileFormat];

    const fileStream = dbReadStream.pipe(transformation());
    const fileDate = new Date().toISOString();
    const fileExtension = exportOptions[input.fileFormat].extension;
    const fileName = `lf-export-${input.projectId}-${fileDate}.${fileExtension}`;

    if (S3StorageService.getIsS3StorageConfigured(env)) {
      const { signedUrl } = await new S3StorageService().uploadFile({
        fileName,
        fileType: exportOptions[input.fileFormat].fileType,
        data: fileStream,
      });

      return {
        type: "s3",
        url: signedUrl,
        fileName,
      };
    }

    // Fall back to returning the data directly. This might fail for large exports due to memory constraints.
    // Self-hosted instances should always run with sufficient memory or have S3 configured to avoid this.
    let fileOutputString = "";
    for await (const chunk of fileStream) {
      fileOutputString += chunk;
    }

    return {
      type: "data",
      data: fileOutputString,
      fileName,
    };
  });
