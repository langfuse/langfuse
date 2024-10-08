import { z } from "zod";

import { env } from "@/src/env.mjs";
import { BatchExportFileFormat, exportOptions } from "@langfuse/shared";
import {
  type FullObservations,
  logger,
  S3StorageService,
} from "@langfuse/shared/src/server";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { type ObservationView } from "@langfuse/shared/src/db";
import {
  DatabaseReadStream,
  streamTransformations,
} from "@langfuse/shared/src/server";
import { getAllGenerations as getAllGenerations } from "../db/getAllGenerationsSqlQuery";
import { GenerationTableOptions } from "../utils/GenerationTableOptions";

const generationsExportInput = GenerationTableOptions.extend({
  fileFormat: z.nativeEnum(BatchExportFileFormat),
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
          selectIOAndMetadata: true, // selecting input/output and metadata
        });
        return generations as unknown as FullObservations;
      },
      queryPageSize,
    );

    const transformation = streamTransformations[input.fileFormat];

    const fileStream = dbReadStream.pipe(transformation());
    const fileDate = new Date().toISOString();
    const fileExtension = exportOptions[input.fileFormat].extension;
    const fileName = `lf-export-${input.projectId}-${fileDate}.${fileExtension}`;

    // If bucketName is configured, we expect that the user has some valid S3 setup.
    const bucketName = env.S3_BUCKET_NAME;
    if (bucketName) {
      logger.info(`Preparing export for ${fileName} on S3`);
      const { signedUrl } = await new S3StorageService({
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        bucketName,
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      }).uploadFile({
        fileName,
        fileType: exportOptions[input.fileFormat].fileType,
        data: fileStream,
        expiresInSeconds: 60 * 60, // 1 hour
      });

      return {
        type: "s3",
        url: signedUrl,
        fileName,
      };
    }

    logger.info(`Preparing export for ${fileName} in memory`);
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
