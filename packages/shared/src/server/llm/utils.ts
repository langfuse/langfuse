import { z } from "zod";

import { decrypt } from "../../encryption";

const ExtraHeaderSchema = z.record(z.string(), z.string());

export function decryptAndParseExtraHeaders(extraHeaders: string | undefined) {
  if (!extraHeaders) return;

  return ExtraHeaderSchema.parse(decrypt(extraHeaders));
}
