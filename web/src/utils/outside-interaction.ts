export const IGNORE_OUTSIDE_INTERACTION_ATTRIBUTE =
  "data-ignore-outside-interaction";

export const IGNORE_OUTSIDE_INTERACTION_SELECTOR = `[${IGNORE_OUTSIDE_INTERACTION_ATTRIBUTE}]`;

export function shouldIgnoreOutsideInteraction(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(IGNORE_OUTSIDE_INTERACTION_SELECTOR))
  );
}
