import {
  EditorView,
  keymap,
  showTooltip,
  type Tooltip,
} from "@uiw/react-codemirror";
import {
  type EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { extractTransferFiles } from "@/src/components/editor/fileDropPaste";

/**
 * "Magic paste" for JSON editors.
 *
 * Non-technical users routinely paste raw text (a log, a chapter, a blob) into a
 * JSON field. Unescaped quotes / backslashes / newlines / control chars inside a
 * string value, or a bare blob in an empty field, produce invalid JSON — and the
 * data is private, so an external escape tool isn't an option. This extension
 * transforms the paste client-side so the JSON stays valid, and shows a passive,
 * dismissible "Paste raw" affordance at the paste site (the transform is a single
 * transaction, so Cmd/Ctrl+Z also reverts it in one step).
 *
 * Two high-confidence, lossless transforms — both fully reversible, so they apply
 * automatically rather than behind a chooser:
 *   - Caret inside a JSON string value → escape the pasted fragment.
 *   - Empty / fully-selected field whose paste isn't already valid JSON → wrap the
 *     paste as a quoted JSON string.
 * Anything else (files, no-op escapes, structural mid-document pastes) is left to
 * the editor's normal paste handling.
 */

// --- pure helpers (exported for unit tests) -------------------------------

/**
 * Escapes arbitrary text so it can be inserted between existing JSON quotes.
 * `JSON.stringify` yields a fully quoted, escaped JSON string literal; stripping
 * the wrapping quotes leaves just the escaped body. Covers `"`, `\`, and all
 * control chars (`\n` `\r` `\t` `\b` `\f` and `\uXXXX`). U+2028/U+2029 are valid
 * unescaped inside a JSON string, so they're intentionally left as-is.
 */
export function escapeForJsonStringBody(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

/** Whether `text` is, on its own, syntactically valid JSON. */
export function isValidJson(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether `pos` sits inside the body of a JSON string (a value string or a
 * property name — escaping is wanted inside both). Scans the document prefix with
 * the canonical JSON string state machine: an unescaped `"` toggles string mode,
 * and a `\` inside a string escapes the next char. This deliberately avoids the
 * syntax tree because an unterminated string (the user typed an opening quote
 * then pasted) isn't a `String` node in the Lezer grammar — the scanner treats
 * it as "still open", which is exactly what we want.
 */
export function isInsideJsonString(state: EditorState, pos: number): boolean {
  return isInsideJsonStringPrefix(state.doc.sliceString(0, pos));
}

/** Core string-state scan over the text preceding the caret. Module-private; the
 * `isInsideJsonString` wrapper above is the intended entry point. */
function isInsideJsonStringPrefix(prefix: string): boolean {
  let inString = false;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (inString) {
      if (ch === "\\") {
        // A backslash at the very end escapes the caret position: the caret sits
        // mid-escape-sequence (e.g. between `\` and `n` of `\n`). Inserting there
        // would split the escape, so treat it as not a safe in-string point.
        if (i === prefix.length - 1) return false;
        i++; // skip the escaped character
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    }
  }
  return inString;
}

/**
 * Whether a selection that starts inside a JSON string stays within that *same*
 * string — i.e. the selected text contains no unescaped `"`. Without this, a
 * selection spanning from one string, across structural JSON, into another
 * string would pass both endpoint checks (each is just quote parity) and the
 * escape branch would silently rewrite the structure between them.
 */
function selectionStaysInJsonString(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  const selected = state.doc.sliceString(from, to);
  for (let i = 0; i < selected.length; i++) {
    const ch = selected[i];
    if (ch === "\\") {
      // A trailing backslash escapes a char outside the selection; replacing the
      // selection would orphan that escape, so treat it as leaving the string.
      if (i === selected.length - 1) return false;
      i++; // skip the escaped character
    } else if (ch === '"') {
      return false; // an unescaped quote closes the string mid-selection
    }
  }
  return true;
}

export type MagicPastePlan = {
  kind: "escape" | "wrap";
  from: number;
  to: number;
  /** The transformed text to insert in place of [from, to]. */
  insert: string;
  /** The original pasted text, kept for the "Paste raw" affordance. */
  raw: string;
};

/**
 * Decides how a pasted text should be transformed at the current selection, or
 * returns null when the paste should be handled normally by the editor.
 */
export function planMagicPaste(
  state: EditorState,
  pastedText: string,
): MagicPastePlan | null {
  if (pastedText === "") return null;
  // Multi-cursor: a single transform would only fill the main range and drop the
  // others, so defer to CodeMirror's native per-cursor paste.
  if (state.selection.ranges.length > 1) return null;
  const sel = state.selection.main;

  // 1) Inside a JSON string → escape the fragment. The selection must start in a
  //    string and stay within that same string, so we never escape across a
  //    structural boundary (which would silently rewrite the JSON shape).
  if (
    isInsideJsonString(state, sel.from) &&
    (sel.empty || selectionStaysInJsonString(state, sel.from, sel.to))
  ) {
    const insert = escapeForJsonStringBody(pastedText);
    // Nothing needed escaping: let CodeMirror paste normally (no surprise).
    if (insert === pastedText) return null;
    return {
      kind: "escape",
      from: sel.from,
      to: sel.to,
      insert,
      raw: pastedText,
    };
  }

  // 2) Blank field whose paste isn't already valid JSON → wrap it as a quoted
  //    JSON string. Covers "paste a blob into the empty input field". Limited to
  //    a blank document so select-all-then-paste over existing content isn't
  //    silently stringified (its structure would be lost behind valid-looking
  //    JSON); that case falls through to normal paste.
  const docIsBlank = state.doc.toString().trim() === "";
  if (docIsBlank && !isValidJson(pastedText)) {
    return {
      kind: "wrap",
      from: 0,
      to: state.doc.length,
      insert: JSON.stringify(pastedText),
      raw: pastedText,
    };
  }

  return null;
}

// --- the "Paste raw" affordance -------------------------------------------

type ActiveTip = {
  /** Range of the just-inserted transformed text. */
  from: number;
  to: number;
  /** Original text, re-inserted when the user chooses "Paste raw". */
  raw: string;
  message: string;
};

const setMagicPasteTip = StateEffect.define<ActiveTip | null>();

const magicPasteTipField = StateField.define<ActiveTip | null>({
  create() {
    return null;
  },
  update(value, tr) {
    // A magic paste sets the tip in the same transaction it edits the doc, so
    // the effect always wins over the dismiss rule below.
    for (const effect of tr.effects) {
      if (effect.is(setMagicPasteTip)) return effect.value;
    }
    // Dismiss on the next real edit (not a bare cursor move) so the control
    // survives navigation/reading; a blur handler clears it on focus-out.
    if (value && tr.docChanged) return null;
    return value;
  },
  provide: (field) =>
    showTooltip.from(field, (tip) => (tip ? buildTooltip(tip) : null)),
});

const PASTE_RAW_KEY = "Mod-Shift-v";
// `Mod` is Cmd on macOS, Ctrl elsewhere; mirror that in the hint and the
// aria-keyshortcuts. `navigator.userAgent` (not the deprecated `.platform`)
// matches repo convention.
const IS_MAC =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
const PASTE_RAW_KEY_LABEL = IS_MAC ? "⇧⌘V" : "Ctrl+Shift+V";
// WAI-ARIA spells the macOS Cmd key as "Meta".
const PASTE_RAW_ARIA_KEYS = IS_MAC ? "Meta+Shift+V" : "Control+Shift+V";

/** Replace the transformed insert with the original raw text (the escape hatch). */
function revertToRaw(view: EditorView, tip: ActiveTip): void {
  const docLength = view.state.doc.length;
  const from = Math.min(tip.from, docLength);
  const to = Math.min(tip.to, docLength);
  view.dispatch({
    changes: { from, to, insert: tip.raw },
    selection: { anchor: from + tip.raw.length },
    effects: setMagicPasteTip.of(null),
    userEvent: "input.paste",
  });
  view.focus();
}

function buildTooltip(tip: ActiveTip): Tooltip {
  return {
    // Anchor at the caret (end of the insert), where `scrollIntoView` brought the
    // viewport — anchoring at the start would land off-screen when a long paste
    // scrolls the start out of view.
    pos: tip.to,
    // Render below the paste so the editor's own top edge / overflow can't clip
    // it; `strictSide: false` still lets it flip up near the bottom of the view.
    above: false,
    strictSide: false,
    arrow: false,
    create(view) {
      const dom = document.createElement("div");
      dom.className = "cm-json-magic-paste";

      // Announce only the status (not the button) to assistive tech.
      const label = document.createElement("span");
      label.className = "cm-json-magic-paste-label";
      label.setAttribute("role", "status");
      label.setAttribute("aria-live", "polite");
      label.textContent = tip.message;

      // "Paste raw" is also reachable from the keyboard via PASTE_RAW_KEY (the
      // tooltip itself isn't in the editor's tab order), advertised here.
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-json-magic-paste-action";
      button.textContent = "Paste raw";
      button.title = `Insert the original text, unescaped (${PASTE_RAW_KEY_LABEL})`;
      button.setAttribute(
        "aria-label",
        `Paste raw — insert the original text, unescaped`,
      );
      button.setAttribute("aria-keyshortcuts", PASTE_RAW_ARIA_KEYS);
      // Keep editor focus so the replace doesn't blur the editor first.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => revertToRaw(view, tip));

      const hint = document.createElement("span");
      hint.className = "cm-json-magic-paste-hint";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = PASTE_RAW_KEY_LABEL;

      dom.append(label, button, hint);
      return { dom };
    },
  };
}

const magicPasteTheme = EditorView.baseTheme({
  // Paint our own surface from app tokens (instead of inheriting CodeMirror's
  // default tooltip background) so the foreground tokens keep their audited
  // contrast in both themes.
  ".cm-tooltip:has(.cm-json-magic-paste)": {
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgb(0 0 0 / 0.12)",
  },
  ".cm-json-magic-paste": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "3px 8px",
    fontSize: "12px",
    lineHeight: "1.4",
    whiteSpace: "nowrap",
  },
  ".cm-json-magic-paste-label": {
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-json-magic-paste-action": {
    padding: "0",
    margin: "0",
    border: "none",
    background: "none",
    font: "inherit",
    color: "hsl(var(--primary))",
    cursor: "pointer",
    textDecoration: "underline",
  },
  ".cm-json-magic-paste-hint": {
    color: "hsl(var(--muted-foreground))",
    opacity: "0.7",
  },
});

/**
 * CodeMirror extension that escapes/wraps pasted text so a JSON field stays valid
 * (see module docs). Files are left to a sibling drop/paste handler. Add it to a
 * `mode="json"` editor's `extensions` (memoize at the call site).
 */
export function createJsonMagicPasteExtension(): Extension {
  return [
    magicPasteTipField,
    magicPasteTheme,
    // Keyboard path for "Paste raw" (the tooltip button isn't in the tab order).
    keymap.of([
      {
        key: PASTE_RAW_KEY,
        run: (view) => {
          const tip = view.state.field(magicPasteTipField, false);
          if (!tip) return false; // no active transform → let the key fall through
          revertToRaw(view, tip);
          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({
      // Clear the affordance when focus leaves so a stale tip can't linger behind
      // the user (and two editors can't show one at once).
      blur(_event, view) {
        if (view.state.field(magicPasteTipField, false)) {
          view.dispatch({ effects: setMagicPasteTip.of(null) });
        }
        return false;
      },
      paste(event, view) {
        // Let the editor's composition-aware paste handle IME composition.
        if (view.composing) return false;
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        // Files belong to the media drop/paste handler. Use the same extractor it
        // does so we never both defer and leave the default handler to insert
        // unescaped text.
        if (extractTransferFiles(clipboard).length > 0) return false;
        const text = clipboard.getData("text/plain");
        if (!text) return false;

        const plan = planMagicPaste(view.state, text);
        if (!plan) return false;

        event.preventDefault();
        const insertEnd = plan.from + plan.insert.length;
        view.dispatch({
          changes: { from: plan.from, to: plan.to, insert: plan.insert },
          selection: { anchor: insertEnd },
          effects: setMagicPasteTip.of({
            from: plan.from,
            to: insertEnd,
            raw: plan.raw,
            message:
              plan.kind === "wrap"
                ? "Wrapped as a JSON string"
                : "Escaped to keep JSON valid",
          }),
          userEvent: "input.paste",
          scrollIntoView: true,
        });
        return true;
      },
    }),
  ];
}
