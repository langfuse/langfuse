import { type IncomingHttpHeaders } from "http";
import {
  getLangfuseHeaderValue,
  normalizeIngestionSdkName,
} from "@langfuse/shared/src/server";

export const SDK_NAME_HEADER = "x-langfuse-sdk-name";
export const SDK_NAME_ATTRIBUTE = "sdk_name";

// Canonicalize to the same closed set as the ingestion path
// (python | javascript) so the span tag stays low-cardinality;
// unknown / non-SDK callers resolve to undefined.
export function extractSdkName(
  headers: IncomingHttpHeaders,
): string | undefined {
  return (
    normalizeIngestionSdkName(
      getLangfuseHeaderValue(headers, SDK_NAME_HEADER),
    ) ?? undefined
  );
}
