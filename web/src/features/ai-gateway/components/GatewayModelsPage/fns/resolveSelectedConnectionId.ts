/**
 * The provider credential the Models tab shows: the requested one, or the first.
 * A requested ID that is not loaded is kept while more pages exist, since it may be on one of them.
 */
export function resolveSelectedConnectionId({
  requestedId,
  loadedIds,
  hasMore,
}: {
  requestedId: string | undefined;
  loadedIds: string[];
  hasMore: boolean;
}): string | undefined {
  if (requestedId && (hasMore || loadedIds.includes(requestedId))) {
    return requestedId;
  }
  return loadedIds[0];
}
