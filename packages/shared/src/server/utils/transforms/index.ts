import { Transform } from "stream";

import { BatchExportFileFormat } from "../../../features/batchExport/types";
import { transformStreamToCsv } from "./transformStreamToCsv";
import { transformStreamToJson } from "./transformStreamToJson";
import { transformStreamToJsonl } from "./transformStreamToJsonl";

export { stringify, stringifyForCsv } from "./stringify";

export const streamTransformations: Record<
  BatchExportFileFormat,
  () => Transform
> = {
  CSV: transformStreamToCsv,
  JSON: transformStreamToJson,
  JSONL: transformStreamToJsonl,
};
