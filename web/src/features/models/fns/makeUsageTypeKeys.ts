import { type FormUsageType } from "@/src/features/models/validation";

/** Row keys are opaque and only need to be unique within one form instance. */
export const makeUsageTypeKeys = (
  existing: Pick<FormUsageType, "key">[],
  count: number,
): string[] => {
  const used = new Set(existing.map((row) => row.key));
  const keys: string[] = [];
  let candidate = existing.length;
  while (keys.length < count) {
    const key = `u${candidate++}`;
    if (!used.has(key)) keys.push(key);
  }
  return keys;
};
