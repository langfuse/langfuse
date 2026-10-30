/**
 * Does an observation answer the trace panel's search box?
 *
 * ONE definition, because two views read it now: the Tree's flat result list
 * (TraceSearchList) and the Timeline, which keeps its bars and dims the ones
 * that miss. A second copy is a second chance for the two to disagree about
 * what a match is — and the Timeline states a count, so a disagreement would be
 * visible as a number that does not match the list beside it.
 *
 * The rule is the one the result list has always used: a case-insensitive
 * substring of the observation's type, name or id. Nothing is searched that the
 * trace panel does not already show.
 */

export type SearchableNode = {
  id: string;
  name: string;
  type: string;
};

export function matchesSearchQuery(
  node: SearchableNode,
  query: string,
): boolean {
  // Trimmed, because a trailing space is a keystroke on the way to the next
  // word and not a thing anybody means to search for. The result list already
  // treated an all-whitespace query as empty; this extends the same reading to
  // the padding around a real one.
  const needle = query.trim().toLowerCase();
  // An empty query is not a match-everything — it is no search at all, and the
  // callers decide what to show instead.
  if (!needle) return false;
  return (
    node.type.toLowerCase().includes(needle) ||
    node.name.toLowerCase().includes(needle) ||
    node.id.toLowerCase().includes(needle)
  );
}
