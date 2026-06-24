// Shared keyboard-shortcut helpers for the annotation workflow (LFE-7628).
//
// Annotators process queue items keyboard-first: select scores, then complete /
// skip / navigate without reaching for the mouse on every item. These helpers
// keep the "don't hijack typing" guard consistent across the score form and the
// queue navigation controls.

/**
 * True when a keyboard event originated from an element where the user is
 * actively typing (text input, textarea, contenteditable / role=textbox, or a
 * select). Global annotation shortcuts must bail out in that case so they never
 * swallow normal text entry (e.g. the free-form score field or comment box).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (target.isContentEditable) return true;

  const role = target.getAttribute("role");
  if (role === "textbox" || role === "combobox") return true;

  return false;
}

/** True when a platform modifier key is held (reserve those for browser/app shortcuts). */
export function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}
