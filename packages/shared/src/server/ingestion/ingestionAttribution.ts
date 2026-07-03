import type { AuthHeaderValidVerificationResult } from "../auth/types";

type HeaderValue = string | string[] | undefined;
export type IngestionHeaderMap = Record<string, HeaderValue>;

export type IngestionAttribution = {
  ingestionApiKey: string;
  ingestionSdkName: string;
  ingestionSdkVersion: string;
};

export const UNKNOWN_INGESTION_SDK_VALUE = "unknown";

const getHeaderValue = (
  headers: IngestionHeaderMap | undefined,
  name: string,
): string => {
  if (!headers) return "";

  const directValue = headers[name];
  if (typeof directValue === "string") return directValue;

  const underscoreValue = headers[name.replaceAll("-", "_")];
  if (typeof underscoreValue === "string") return underscoreValue;

  return "";
};

const normalizeSdkValue = (value: string | undefined): string =>
  value || UNKNOWN_INGESTION_SDK_VALUE;

export const getLangfuseHeaderValue = getHeaderValue;

export const createIngestionAttribution = (params: {
  headers?: IngestionHeaderMap;
  authCheck: AuthHeaderValidVerificationResult;
}): IngestionAttribution => {
  const { headers, authCheck } = params;

  return {
    ingestionApiKey: authCheck.scope.publicKey,
    ingestionSdkName: normalizeSdkValue(
      getHeaderValue(headers, "x-langfuse-sdk-name"),
    ),
    ingestionSdkVersion: normalizeSdkValue(
      getHeaderValue(headers, "x-langfuse-sdk-version"),
    ),
  };
};

export const createUnknownSdkIngestionAttribution = (params: {
  authCheck: {
    scope: { publicKey?: string | null; projectId?: string | null };
  };
}): IngestionAttribution => ({
  ingestionApiKey: params.authCheck.scope.publicKey ?? "",
  ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
  ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
});
