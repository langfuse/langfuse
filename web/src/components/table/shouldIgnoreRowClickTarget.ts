/**
 * Controls that own their own click, so a row- or cell-level click handler
 * must leave them alone.
 */
const INTERACTIVE_ROW_CLICK_SELECTOR =
  "a, button, input, select, textarea, summary, [role='button'], [role='link']";

/**
 * Whether a click landed on a real control rather than on the row's body.
 *
 * Shared with the per-experiment cells in the comparison view, which open
 * their own peek target and need the same exemption the row uses. Note that a
 * hover-card trigger rendered without `asChild` becomes an `<a>` and is
 * therefore ignored here — pass `asChild` so it stays part of the clickable
 * surface.
 */
export const shouldIgnoreRowClickTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest(INTERACTIVE_ROW_CLICK_SELECTOR));
};
