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

  // Radix Select/Combobox dropdowns move focus onto the listbox/option elements
  // while navigating with the keyboard; bail there too so `1`-`9` don't pick a
  // score at the same time as moving through dropdown options.
  const role = target.getAttribute("role");
  if (
    role === "textbox" ||
    role === "combobox" ||
    role === "listbox" ||
    role === "option"
  )
    return true;

  return false;
}

/**
 * True when focus sits on a focusable *activation* control (button, radio,
 * `role=button`, or a Radix roving-focus item) rather than the page body.
 *
 * Queue-navigation shortcuts (Enter / arrows) must bail in that case: pressing
 * Enter on a focused button dispatches the browser-synthesized click as the
 * keydown's default action, and Radix `ToggleGroup` uses ←/→ for roving focus.
 * Without this guard a window-level handler would `preventDefault()` (cancelling
 * the button's click) and run the navigation/complete action instead.
 *
 * Pass `except` to allow a specific control (e.g. the Mark-Completed button)
 * through — though even there the button's own click handler does the work, so
 * bailing is harmless.
 */
export function isInteractiveTarget(
  target: EventTarget | null,
  except?: HTMLElement | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (except && (target === except || except.contains(target))) return false;

  if (target instanceof HTMLButtonElement) return true;

  const role = target.getAttribute("role");
  if (role === "button" || role === "radio") return true;

  // Radix roving-focus widgets (ToggleGroup, RadioGroup, …) tag their items.
  if (target.closest("[data-radix-collection-item]")) return true;

  return false;
}

/**
 * True when an open modal/drawer is present. Annotation-queue shortcuts bail so
 * they never steal Enter from a drawer's Submit button or hijack keys while a
 * dialog is the user's focus context.
 */
export function isOpenDialogPresent(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
}

/**
 * True when a "hot" platform modifier key is held — reserve those for browser /
 * app shortcuts (Cmd+K, Ctrl+S, …) and bail out of our printable-key shortcuts.
 *
 * AltGr (Right Alt) is deliberately NOT treated as hot: on many international
 * layouts (German QWERTZ, French AZERTY, Spanish, Italian, Nordic, …) the `[`
 * and `]` characters are typed via AltGr, which the browser surfaces as
 * `altKey=true` (and `ctrlKey=true` on Windows/Linux). Treating that as a
 * modifier would silently kill the bracket shortcut for those users, so we
 * detect AltGr explicitly and only treat `metaKey` / `ctrl-without-alt` as hot.
 */
export function hasModifier(event: KeyboardEvent): boolean {
  if (event.getModifierState && event.getModifierState("AltGraph"))
    return false;
  return event.metaKey || (event.ctrlKey && !event.altKey);
}
