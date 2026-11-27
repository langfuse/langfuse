import { Transform } from "stream";

import { BatchExportFileFormat } from "../../../features/batchExport/types";
import { transformStreamToCsv } from "./transformStreamToCsv";
import { transformStreamToJson } from "./transformStreamToJson";
import { transformStreamToJsonl } from "./transformStreamToJsonl";

// stringify lives in the client-safe utils so the web client (legacy trace
// download, log view copy/download) serializes through the exact same helper
// as the server-side trace download route.
export { stringify, stringifyForCsv } from "../../../utils/stringify";

export const streamTransformations: Record<
  BatchExportFileFormat,
  () => Transform
> = {
  CSV: transformStreamToCsv,
  JSON: transformStreamToJson,
  JSONL: transformStreamToJsonl,
};
