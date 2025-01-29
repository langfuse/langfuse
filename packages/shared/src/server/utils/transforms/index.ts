import { Transform } from "stream";

import { BatchExportFileFormat } from "../../../features/batchExport/types";
import { transformStreamToCsv } from "./transformStreamToCsv";
import { transformStreamToJson } from "./transformStreamToJson";

export const streamTransformations: Record<
  BatchExportFileFormat,
  () => Transform
> = {
  CSV: transformStreamToCsv,
  JSON: transformStreamToJson,
};
