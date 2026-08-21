import { type IncomingHttpHeaders } from "http";

import {
  getLangfuseHeaderValue,
  normalizeIngestionSdkName,
} from "../../ingestion/ingestionAttribution";

export const SDK_NAME_HEADER = "x-langfuse-sdk-name";

export const SDK_NAME_ATTRIBUTE = "sdk_name";

/** extractSdkName canonicalizes the request's SDK-name header to the ingestion closed set, or undefined. */
export function extractSdkName(
  headers: IncomingHttpHeaders,
): string | undefined {
  return (
    normalizeIngestionSdkName(
      getLangfuseHeaderValue(headers, SDK_NAME_HEADER),
    ) ?? undefined
  );
}
