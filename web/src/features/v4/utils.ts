export const normalizeLegacyApiEntrypoint = (entrypoint: string) =>
  entrypoint.replace(/^publicapi:\s*/, "");

const NON_ACTIONABLE_API_CALLER_USER_AGENT = /(claude|codex|curl)/i;

export const isActionableLegacyApiUsage = (row: {
  callers?: { userAgent?: string; isOther?: true }[];
}) =>
  !row.callers?.length ||
  row.callers.some(
    (caller) =>
      caller.isOther ||
      !caller.userAgent ||
      !NON_ACTIONABLE_API_CALLER_USER_AGENT.test(caller.userAgent),
  );

export const countLegacyApiEntrypoints = (
  rows: Array<{ entrypoint: string }> | undefined,
): number => {
  const entrypoints = new Set<string>();

  for (const row of rows ?? []) {
    const entrypoint = normalizeLegacyApiEntrypoint(row.entrypoint);
    if (entrypoint) entrypoints.add(entrypoint);
  }

  return entrypoints.size;
};

export const countActionableLegacyApiEntrypoints = (
  rows:
    | Array<{
        entrypoint: string;
        callers?: { userAgent?: string; isOther?: true }[];
      }>
    | undefined,
): number =>
  countLegacyApiEntrypoints(rows?.filter(isActionableLegacyApiUsage));
