import { type IncomingHttpHeaders } from "http";

import { extractPublicApiCallerAttribution } from "../../ingestion/ingestionAttribution";

export const SDK_NAME_HEADER = "x-langfuse-sdk-name";
export const SDK_VERSION_HEADER = "x-langfuse-sdk-version";

export const SDK_NAME_ATTRIBUTE = "sdk_name";
export const SDK_VERSION_ATTRIBUTE = "sdk_version";

export type SdkAttributes = {
  sdkName?: "python" | "javascript";
  sdkVersion?: string;
};

export function extractSdkAttributes(
  headers: IncomingHttpHeaders,
): SdkAttributes {
  const { sdkName, sdkVersion } = extractPublicApiCallerAttribution(headers);
  return {
    ...(sdkName ? { sdkName } : {}),
    ...(sdkVersion ? { sdkVersion } : {}),
  };
}

/** extractSdkName canonicalizes the request's SDK-name header to the ingestion closed set, or undefined. */
export function extractSdkName(
  headers: IncomingHttpHeaders,
): string | undefined {
  return extractSdkAttributes(headers).sdkName;
}
