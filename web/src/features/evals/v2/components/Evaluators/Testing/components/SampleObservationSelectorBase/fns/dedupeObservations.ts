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
