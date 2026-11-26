/* eslint-disable @repo/single-function-export-matching-filename -- TODO: split into one function per file */
/** @internal */
export function dedupeObservations<Observation extends { id: string }>(
  observations: Observation[],
) {
  const seenIds = new Set<string>();

  return observations.filter((observation) => {
    if (seenIds.has(observation.id)) return false;
    seenIds.add(observation.id);
    return true;
  });
}

export function dedupeObservationPages<Observation extends { id: string }>(
  pages: Observation[][],
) {
  const seenIds = new Set<string>();

  return pages.map((page) =>
    page.filter((observation) => {
      if (seenIds.has(observation.id)) return false;
      seenIds.add(observation.id);
      return true;
    }),
  );
}
