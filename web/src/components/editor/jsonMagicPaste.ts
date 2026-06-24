import { EditorView, showTooltip, type Tooltip } from "@uiw/react-codemirror";
import {
  type EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";

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

/** Core string-state scan over the text preceding the caret. */
export function isInsideJsonStringPrefix(prefix: string): boolean {
  let inString = false;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (inString) {
      if (ch === "\\") {
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
  const sel = state.selection.main;

  // 1) Inside a JSON string → escape the fragment. Require both ends of the
  //    selection to sit inside the string so we never escape across a boundary.
  if (
    isInsideJsonString(state, sel.from) &&
    (sel.empty || isInsideJsonString(state, sel.to))
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

  // 2) Empty/whitespace field, or the paste replaces the whole document, and the
  //    paste isn't already valid JSON → wrap it as a quoted JSON string. Covers
  //    "paste a blob into the empty input field".
  const docIsBlank = state.doc.toString().trim() === "";
  const replacingWholeDoc = sel.from === 0 && sel.to === state.doc.length;
  if ((docIsBlank || replacingWholeDoc) && !isValidJson(pastedText)) {
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

function transferHasFiles(data: DataTransfer | null | undefined): boolean {
  if (!data) return false;
  if (data.files.length > 0) return true;
  return Array.from(data.items).some((item) => item.kind === "file");
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
    // the effect always wins over the dismiss-on-edit rule below.
    for (const effect of tr.effects) {
      if (effect.is(setMagicPasteTip)) return effect.value;
    }
    // VS Code-style: the control goes away on the next edit or cursor move.
    if (value && (tr.docChanged || tr.selection)) return null;
    return value;
  },
  provide: (field) =>
    showTooltip.from(field, (tip) => (tip ? buildTooltip(tip) : null)),
});

function buildTooltip(tip: ActiveTip): Tooltip {
  return {
    pos: tip.from,
    // Render below the paste so the editor's own top edge / overflow can't clip
    // it; `strictSide: false` still lets it flip up near the bottom of the view.
    above: false,
    strictSide: false,
    arrow: false,
    create(view) {
      const dom = document.createElement("div");
      dom.className = "cm-json-magic-paste";
      // The post-paste control is otherwise silent to assistive tech.
      dom.setAttribute("role", "status");
      dom.setAttribute("aria-live", "polite");

      const label = document.createElement("span");
      label.className = "cm-json-magic-paste-label";
      label.textContent = tip.message;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-json-magic-paste-action";
      button.textContent = "Paste raw";
      button.setAttribute(
        "aria-label",
        "Replace with the original text, unescaped",
      );
      // Keep editor focus so the replace doesn't blur the editor first.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
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
      });

      dom.append(label, button);
      return { dom };
    },
  };
}

const magicPasteTheme = EditorView.baseTheme({
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
    EditorView.domEventHandlers({
      paste(event, view) {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        // Files belong to the media drop/paste handler.
        if (transferHasFiles(clipboard)) return false;
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
