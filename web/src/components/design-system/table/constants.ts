/**
 * What a settled, empty cell shows.
 *
 * An em dash says "there is nothing here". A blank cell says nothing at all:
 * it reads the same as a column that failed to load, a value still on its way,
 * or a bug. This is only for a value that has ARRIVED and is empty — a pending
 * cell renders a skeleton, never this.
 *
 * Pair it with a visually-hidden word wherever it stands alone, because an em
 * dash on its own reaches a screen reader as punctuation.
 */
export const EMPTY_VALUE_PLACEHOLDER = "—";

/** What the em dash means, for assistive technology. */
export const EMPTY_VALUE_LABEL = "No value";
