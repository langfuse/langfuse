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

export const parseStoredHiddenSessionHeaderDetails = (
  raw: unknown,
): StoredHiddenSessionHeaderDetails => {
  const result = storedHiddenSessionHeaderDetailsSchema.safeParse(raw);
  return result.success ? result.data : [];
};
