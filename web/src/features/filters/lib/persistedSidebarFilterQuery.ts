export type PersistedSidebarFilterQueryState = {
  contextId: string | null;
  query: string;
};

export function buildSidebarFilterQueryStorageKey(params: {
  tableName: string;
  contextId?: string | null;
}): string {
  const { tableName, contextId } = params;
  const scopedContextId = contextId ?? "global";
  return `${tableName}-filter-query-${scopedContextId}`;
}

export function createPersistedSidebarFilterQueryState(
  contextId: string | null,
  query: string,
): PersistedSidebarFilterQueryState {
  return { contextId, query };
}

export function parsePersistedSidebarFilterQueryState(
  rawState: string | null,
): PersistedSidebarFilterQueryState | null {
  if (!rawState) return null;

  try {
    const parsed = JSON.parse(rawState) as unknown;

    if (!parsed || typeof parsed !== "object") return null;

    const contextId =
      "contextId" in parsed && typeof parsed.contextId === "string"
        ? parsed.contextId
        : "contextId" in parsed && parsed.contextId === null
          ? null
          : undefined;
    const query =
      "query" in parsed && typeof parsed.query === "string"
        ? parsed.query
        : undefined;

    if (contextId === undefined || query === undefined) return null;

    return { contextId, query };
  } catch {
    return null;
  }
}

export function getPersistedSidebarFilterQueryForContext(params: {
  state: PersistedSidebarFilterQueryState | null;
  contextId: string | null;
}): string {
  const { state, contextId } = params;
  if (!state) return "";
  return state.contextId === contextId ? state.query : "";
}

export function readPersistedSidebarFilterQuery(params: {
  storageKey: string;
  contextId: string | null;
}): string {
  const { storageKey, contextId } = params;
  if (typeof window === "undefined") return "";

  const persistedState = parsePersistedSidebarFilterQueryState(
    sessionStorage.getItem(storageKey),
  );

  return getPersistedSidebarFilterQueryForContext({
    state: persistedState,
    contextId,
  });
}
