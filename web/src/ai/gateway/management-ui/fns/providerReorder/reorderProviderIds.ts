export function reorderProviderIds(
  ids: string[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ids;
  }

  const nextIds = [...ids];
  const [movedId] = nextIds.splice(sourceIndex, 1);
  if (!movedId) return ids;
  nextIds.splice(targetIndex, 0, movedId);
  return nextIds;
}
