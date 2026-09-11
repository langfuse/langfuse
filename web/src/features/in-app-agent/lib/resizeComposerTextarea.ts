const MAX_COMPOSER_TEXTAREA_HEIGHT_PX = 160;

/**
 * Size the composer to its content, up to the CSS max. Skip when the field
 * has no real width yet — a 0-wide measure wraps every character, so
 * scrollHeight jumps to the cap and sticks until the next input change.
 */
export function resizeComposerTextarea(input: HTMLTextAreaElement | null) {
  if (!input || input.getBoundingClientRect().width < 1) {
    return;
  }

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, MAX_COMPOSER_TEXTAREA_HEIGHT_PX)}px`;
}
