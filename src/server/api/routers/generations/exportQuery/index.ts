import { type Transform } from "stream";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import {
  exportFileFormats,
  exportOptions,
} from "@/src/server/api/interfaces/exportTypes";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { type ObservationView } from "@prisma/client";

import { GenerationTableOptions } from "../utils/GenerationTableOptions";
import { DatabaseReadStream } from "./db/DatabaseReadStream";
import { getIsS3BucketConfigured } from "./config/getIsS3BucketConfigured";
import { getSqlQueryFromInput } from "./db/getSqlQueryFromInput";
import { transformStreamToCsv } from "./transforms/transformStreamToCsv";
import { transformStreamToJson } from "./transforms/transformStreamToJson";
import { transformStreamToJsonLines } from "./transforms/transformStreamToJsonLines";
import { uploadToS3 } from "./storage/uploadToS3";

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
  .query<GenerationsExportResult>(async ({ input, ctx }) => {
    const rawSqlQuery = getSqlQueryFromInput(input);
    const dbReadStream = new DatabaseReadStream<ObservationView>(
      ctx.prisma,
      rawSqlQuery,
      1000,
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

    if (getIsS3BucketConfigured(env)) {
      const { signedUrl } = await uploadToS3({
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
    // Self-hosted instances should always have S3 configured to avoid this.
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
