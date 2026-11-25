/**
 * The gateway keys to offer while `userIds` are selected: the keys those users
 * own, plus the keys already selected so they stay visible and can be cleared.
 * Every key when no user is selected.
 */
export function filterApiKeysByOwner(params: {
  apiKeyIds: readonly string[];
  owners: ReadonlyMap<string, string | null>;
  userIds: readonly string[];
  selectedApiKeyIds: readonly string[];
}): string[] {
  if (params.userIds.length === 0) return [...params.apiKeyIds];
  const userIds = new Set(params.userIds);
  const selected = new Set(params.selectedApiKeyIds);
  return params.apiKeyIds.filter((id) => {
    const owner = params.owners.get(id);
    return selected.has(id) || (owner != null && userIds.has(owner));
  });
}

/**
 * The selected gateway keys that still match once `userIds` are selected:
 * keys owned by one of them, and typed keys with no known owner, such as
 * deleted keys. Keys of other users and service-account keys would only
 * empty the results, as the filters combine with AND.
 */
export function keepApiKeysOfUsers(params: {
  selectedApiKeyIds: readonly string[];
  owners: ReadonlyMap<string, string | null>;
  userIds: readonly string[];
}): string[] {
  if (params.userIds.length === 0) return [...params.selectedApiKeyIds];
  const userIds = new Set(params.userIds);
  return params.selectedApiKeyIds.filter((id) => {
    if (!params.owners.has(id)) return true;
    const owner = params.owners.get(id);
    return owner != null && userIds.has(owner);
  });
}
