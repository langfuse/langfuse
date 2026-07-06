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
 * True when an open overlay (dialog/drawer or dropdown menu) that does NOT
 * contain `root` is present.
 *
 * The score form suspends its shortcuts for an *overlapping* surface — the
 * comment editor popover, or the score-config picker dropdown (`role="menu"`,
 * portaled to body) whose own ↑/↓ navigation we must not steal — but must keep
 * working when it is merely mounted *inside* a drawer (the Annotate drawer on a
 * trace/observation/session detail page); that wrapping drawer is an ancestor
 * of `root`, so it doesn't count.
 */
export function hasBlockingOverlay(root: HTMLElement | null): boolean {
  if (typeof document === "undefined") return false;
  const overlays = document.querySelectorAll(
    '[role="dialog"]:not([aria-hidden="true"]), [role="menu"][data-state="open"]',
  );
  for (const overlay of overlays) {
    if (!root || !overlay.contains(root)) return true;
  }
  return false;
}

/**
 * True when the event is the "complete + next" submit chord: `Cmd+Enter`
 * (macOS) or `Ctrl+Enter` (Windows/Linux).
 *
 * This is the universal web "submit / send" gesture (Slack, GitHub, Linear, and
 * Langfuse's own NewProject / Comment forms). Unlike the bare-key shortcuts it
 * is deliberately allowed to fire *while a text field is focused* — so an
 * annotator can finish typing in the multi-line Feedback field and complete the
 * item without first blurring it. Bare `Enter` inside a textarea stays a newline.
 */
export function isCompleteShortcut(event: KeyboardEvent): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

/**
 * Best-effort "is this an Apple device" check, used only to render `⌘` vs `Ctrl`
 * in shortcut hints. Call from an effect (not during render) to avoid an SSR
 * hydration mismatch.
 */
export function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("Mac");
}

/**
 * True when a "hot" platform modifier key is held — reserve those for browser /
 * app shortcuts (Cmd+K, Ctrl+S, …) and bail out of our printable-key shortcuts.
 *
 * AltGr (Right Alt) is deliberately NOT treated as hot: on many international
 * layouts (German QWERTZ, French AZERTY, Spanish, Italian, Nordic, …) printable
 * characters (digits, punctuation) are produced via AltGr, which the browser
 * surfaces as `altKey=true` (and `ctrlKey=true` on Windows/Linux). Treating that
 * as a modifier would silently kill the printable-key shortcuts for those users,
 * so we detect AltGr explicitly and only treat `metaKey` / `ctrl-without-alt` as
 * hot.
 */
export function hasModifier(event: KeyboardEvent): boolean {
  if (event.getModifierState && event.getModifierState("AltGraph"))
    return false;
  return event.metaKey || (event.ctrlKey && !event.altKey);
}
