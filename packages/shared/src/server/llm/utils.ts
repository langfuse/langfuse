import { z } from "zod/v4";

import { decrypt } from "../../encryption";

const ExtraHeaderSchema = z.record(z.string(), z.string());

export function decryptAndParseExtraHeaders(
  extraHeaders: string | null | undefined,
) {
  if (!extraHeaders) return;

  return ExtraHeaderSchema.parse(JSON.parse(decrypt(extraHeaders)));
}
