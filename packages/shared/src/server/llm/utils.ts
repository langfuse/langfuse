import { z } from "zod";

import { decrypt } from "../../encryption";

const ExtraHeaderSchema = z.record(z.string(), z.string());

export function decryptAndParseExtraHeaders(
  extraHeaders: string | null | undefined,
) {
  if (!extraHeaders) return;

  return ExtraHeaderSchema.parse(JSON.parse(decrypt(extraHeaders)));
}

/**
 * Process baseURL template for OpenAI adapter only.
 * Replaces {model} placeholder with actual model name.
 * This is a workaround for proxies that require the model name in the URL azureOpenAIBasePath
 * while having OpenAI compliance otherwise
 */
export function processOpenAIBaseURL(params: {
  url: string | null | undefined;
  modelName: string;
}): string | null | undefined {
  const { url, modelName } = params;

  if (!url || !url.includes("{model}")) {
    return url;
  }

  return url.replace("{model}", modelName);
}
