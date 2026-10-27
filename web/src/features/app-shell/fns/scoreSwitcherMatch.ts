const WORD_SEPARATOR = /[\s\-_/.:]+/;

/**
 * Ranks a switcher entry for a query by its names only, never its id: the
 * first keyword is the entry's own name, the rest is context such as the
 * organization a project belongs to. Returns 0 to hide the entry.
 */
export function scoreSwitcherMatch(query: string, keywords: string[]): number {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return 1;
  const [name = "", ...context] = keywords.map((keyword) =>
    keyword.toLocaleLowerCase(),
  );

  if (name.startsWith(needle)) return 1;
  if (name.split(WORD_SEPARATOR).some((word) => word.startsWith(needle)))
    return 0.9;
  if (name.includes(needle)) return 0.75;
  if (context.some((keyword) => keyword.includes(needle))) return 0.5;
  return 0;
}
