import { Transform } from "stream";

import { BatchExportFileFormat } from "@langfuse/shared";

import { transformStreamToCsv } from "./transformStreamToCsv";
import { transformStreamToJson } from "./transformStreamToJson";

export const streamTransformations: Record<
  BatchExportFileFormat,
  () => Transform
> = {
  CSV: transformStreamToCsv,
  JSON: transformStreamToJson,
};
