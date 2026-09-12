import { z } from "zod";

export const MAX_STORED_HIDDEN_SESSION_HEADER_DETAILS = 1_000;

const storedHiddenSessionHeaderDetailsSchema = z
  .array(z.string().min(1).max(2_000))
  .max(MAX_STORED_HIDDEN_SESSION_HEADER_DETAILS)
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
  let firstFingerprint = 2_166_136_261;
  let secondFingerprint = 2_654_435_769;
  for (let index = 0; index < identity.length; index += 1) {
    const codeUnit = identity.charCodeAt(index);
    firstFingerprint = Math.imul(firstFingerprint ^ codeUnit, 16_777_619);
    secondFingerprint = Math.imul(secondFingerprint ^ codeUnit, 2_246_822_519);
  }
  return `${type}-${(firstFingerprint >>> 0).toString(36)}-${(secondFingerprint >>> 0).toString(36)}`;
};

export const parseStoredHiddenSessionHeaderDetails = (
  raw: unknown,
): StoredHiddenSessionHeaderDetails => {
  const result = storedHiddenSessionHeaderDetailsSchema.safeParse(raw);
  return result.success ? result.data : [];
};
