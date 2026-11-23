// Ranking for "does this typed text mean this field value?".
//
// Prefix beats substring, both case-insensitive (callers lowercase). A single
// trailing plural also matches the singular exactly, so `generations` reaches
// `generation` and `errors` reaches `error`. The stem is only accepted as an
// exact value — stripping a trailing "s" must not turn "status" into a prefix
// of unrelated words.

const MIN_PLURAL_LENGTH = 5;

function singularOf(word: string): string | null {
  if (
    word.length < MIN_PLURAL_LENGTH ||
    !word.endsWith("s") ||
    word.endsWith("ss")
  ) {
    return null;
  }
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  return word.slice(0, -1);
}

function directRank(value: string, query: string): number | null {
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (value.includes(query)) return 2;
  return null;
}

/** 0 exact, 1 prefix, 2 substring, null when the value does not match. */
export function valueQueryRank(value: string, query: string): number | null {
  const direct = directRank(value, query);
  if (direct !== null) return direct;
  const querySingular = singularOf(query);
  if (querySingular !== null && value === querySingular) return 0;
  const valueSingular = singularOf(value);
  if (valueSingular !== null && valueSingular === query) return 0;
  return null;
}
