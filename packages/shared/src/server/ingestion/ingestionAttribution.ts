import type { AuthHeaderValidVerificationResultIngestion } from "../auth/types";

type HeaderValue = string | string[] | undefined;
export type IngestionHeaderMap = Record<string, HeaderValue>;

export type IngestionAttribution = {
  ingestionApiKey: string;
  ingestionSdkName: string;
  ingestionSdkVersion: string;
};

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

export const getLangfuseHeaderValue = getHeaderValue;

export const createIngestionAttribution = (params: {
  headers?: IngestionHeaderMap;
  authCheck: AuthHeaderValidVerificationResultIngestion;
}): IngestionAttribution => {
  const { headers, authCheck } = params;

  return {
    ingestionApiKey: authCheck.scope.publicKey ?? "",
    ingestionSdkName: getHeaderValue(headers, "x-langfuse-sdk-name"),
    ingestionSdkVersion: getHeaderValue(headers, "x-langfuse-sdk-version"),
  };
};

export const normalizeIngestionAttribution = (
  attribution?: Partial<IngestionAttribution>,
): IngestionAttribution => ({
  ingestionApiKey: attribution?.ingestionApiKey ?? "",
  ingestionSdkName: attribution?.ingestionSdkName ?? "",
  ingestionSdkVersion: attribution?.ingestionSdkVersion ?? "",
});
