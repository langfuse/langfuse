import { z } from "zod";

const storedHiddenSessionHeaderDetailsSchema = z
  .array(z.string().min(1).max(2_000))
  .max(1_000)
  .transform((keys) => Array.from(new Set(keys)));

export type StoredHiddenSessionHeaderDetails = z.infer<
  typeof storedHiddenSessionHeaderDetailsSchema
>;

export const sessionHeaderVisibilityStorageKey = (projectId: string) =>
  `modern-session:hidden-header-details:v1:${projectId}`;

export const sessionHeaderDynamicDetailKey = (
  type: "metadata" | "score" | "user",
  identity: string,
) => {
  let fingerprint = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    fingerprint ^= identity.charCodeAt(index);
    fingerprint = Math.imul(fingerprint, 16_777_619);
  }
  return `${type}-${(fingerprint >>> 0).toString(36)}`;
};

export const parseStoredHiddenSessionHeaderDetails = (
  raw: unknown,
): StoredHiddenSessionHeaderDetails => {
  const result = storedHiddenSessionHeaderDetailsSchema.safeParse(raw);
  return result.success ? result.data : [];
};
