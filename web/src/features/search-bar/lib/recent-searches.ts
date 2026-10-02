// Recent searches — localStorage-backed, newest first, scoped per project
// (the empty-state section of the search bar dropdown).

const KEY_PREFIX = "lf-search-bar-recents";
const MAX = 8;

function storageKey(projectId: string): string {
  return `${KEY_PREFIX}:${projectId}`;
}

export function getRecentSearches(projectId: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(
      localStorage.getItem(storageKey(projectId)) ?? "[]",
    ) as unknown;
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function recordRecentSearch(projectId: string, query: string): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = query.trim();
  if (trimmed.length === 0) return;
  const next = [
    trimmed,
    ...getRecentSearches(projectId).filter((q) => q !== trimmed),
  ].slice(0, MAX);
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(next));
  } catch {
    // storage full/blocked — recents are best-effort
  }
}
