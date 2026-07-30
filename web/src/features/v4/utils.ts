export const normalizeLegacyApiEntrypoint = (entrypoint: string) =>
  entrypoint.replace(/^publicapi:\s*/, "");

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
