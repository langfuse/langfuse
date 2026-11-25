export type PersistedSidebarFilterQueryState = {
  contextId: string | null;
  query: string;
};

/**
 * The page-level entity an embedded table is scoped to. Such a table bounds its
 * rows with a hidden filter (a user's traces, a session's events), so it
 * persists its sidebar filters separately from the project-wide table: an
 * inherited User ID would AND with the page's own and return nothing
 * (LFE-14824).
 */
export type EmbeddedFilterScope = "user" | "session" | "prompt" | "model";

export function buildSidebarFilterSessionContextId(
  projectId: string,
  embeddedScope?: EmbeddedFilterScope,
): string {
  return embeddedScope ? `${projectId}:${embeddedScope}` : projectId;
}

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

function parsePersistedSidebarFilterQueryState(
  rawState: string | null,
): PersistedSidebarFilterQueryState | null {
  if (!rawState) return null;

  try {
    const parsed = JSON.parse(rawState) as unknown;

    if (!parsed || typeof parsed !== "object") return null;

    const contextId = (() => {
      if ("contextId" in parsed && typeof parsed.contextId === "string") {
        return parsed.contextId;
      }
      if ("contextId" in parsed && parsed.contextId === null) {
        return null;
      }
      return undefined;
    })();
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

  try {
    const persistedState = parsePersistedSidebarFilterQueryState(
      sessionStorage.getItem(storageKey),
    );

    return getPersistedSidebarFilterQueryForContext({
      state: persistedState,
      contextId,
    });
  } catch (error) {
    console.warn("Error reading from session storage", error);
    return "";
  }
}

export function writePersistedSidebarFilterQuery(params: {
  storageKey: string;
  contextId: string | null;
  query: string;
}): void {
  if (typeof window === "undefined") return;
  const { storageKey, contextId, query } = params;
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify(createPersistedSidebarFilterQueryState(contextId, query)),
    );
  } catch (error) {
    console.warn("Error writing to session storage", error);
  }
}

/** Carry committed filters only for an explicit in-page context change. */
export function carryPersistedSidebarFilterQuery(params: {
  tableName: string;
  fromContextId: string;
  toContextId: string;
  urlQuery: string | null | undefined;
}): void {
  const { tableName, fromContextId, toContextId, urlQuery } = params;
  if (fromContextId === toContextId) return;
  const query =
    typeof urlQuery === "string"
      ? urlQuery
      : readPersistedSidebarFilterQuery({
          storageKey: buildSidebarFilterQueryStorageKey({
            tableName,
            contextId: fromContextId,
          }),
          contextId: fromContextId,
        });
  writePersistedSidebarFilterQuery({
    storageKey: buildSidebarFilterQueryStorageKey({
      tableName,
      contextId: toContextId,
    }),
    contextId: toContextId,
    query,
  });
}
