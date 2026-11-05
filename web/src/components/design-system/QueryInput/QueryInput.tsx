// Controlled query editor. Parsing, token projection, and completion edits
// belong to the caller; this component owns DOM editing and selection.
//
// Selection model: the BROWSER owns selection. No mouse handler prevents
// default; click, drag, double-click, and Shift+Arrow are native. A document
// `selectionchange` listener mirrors the native selection into React state
// for completion planning — it never writes back. The selection is written
// programmatically in exactly three cases: restoring it across a controlled
// text mutation, query-aware Alt/Ctrl+Arrow word movement, and caret
// placement after a popover insert. All text mutations flow through
// `beforeinput` (plus copy/cut/paste interception) as range splices against
// the draft string.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import {
  AlertCircle,
  Bookmark,
  Check,
  Clock,
  Parentheses,
  Search,
  WandSparkles,
  X,
} from "@langfuse/icons";

import { Layer } from "@/src/components/design-system/Layer/Layer";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { InputControl } from "../internal/InputControl/InputControl";
import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";

import {
  WORD_JOINER,
  QUERY_LABEL_COLORS,
} from "../QueryTokens/QueryTokens.constants";
import { QueryTokens } from "../QueryTokens/QueryTokens";
import { optionDomId } from "../internal/QueryInput/fns/optionDomId";
export { optionDomId } from "../internal/QueryInput/fns/optionDomId";

type QueryToken = React.ComponentProps<typeof QueryTokens>["tokens"][number];

type QueryCompletion = {
  id: string;
  label: string;
  section?: string;
  detail?: string;
  icon?: keyof typeof suggestionIcons;
  labelColor?: keyof typeof QUERY_LABEL_COLORS;
  badges?: (Pick<React.ComponentProps<typeof Badge>, "text" | "color"> & {
    description: string;
  })[];
  selected?: boolean;
  edit: { next: string; caret: number; keepOpen: boolean };
  onApplied: (value: string) => void;
};

export type QueryCompletionPlan = {
  options: QueryCompletion[];
  autoHighlight: boolean;
  loading: boolean;
};

const suggestionIcons = {
  search: Search,
  history: Clock,
  bookmark: Bookmark,
  syntax: Parentheses,
};

// Word joiners give the DOM caret boundaries
// between pills without changing the query text; stripped before the text
// reaches the model or clipboard.
const WORD_JOINER_RE = new RegExp(WORD_JOINER, "g");

// Shared by the visible tooltip and its screen-reader description, so a
// deactivated token reads the same either way.
const notAppliedNote = (reason: string) =>
  `Not applied on this view: ${reason}`;

// Surrogate-pair guards: a non-BMP codepoint (emoji, supplementary CJK) is two
// UTF-16 code units, so a ±1 caret step can split it. Used to step the whole
// pair in the Arrow-key handler. (charCodeAt returns NaN past the end → false.)
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

type LogicalRange = { start: number; end: number };

function textFromRoot(root: HTMLElement): string {
  return (root.textContent ?? "").replace(WORD_JOINER_RE, "");
}

// IME composition (Korean, Chinese, Japanese) inserts a text node the
// contenteditable root does not already own. React will not remove that
// sibling when it later projects a token, so the composed run doubles and
// state-based delete cannot reach it. Strip those unmanaged nodes after
// reading textContent — token spans are all ELEMENT_NODE.
function stripUnmanagedRootChildren(root: HTMLElement): boolean {
  let removed = false;
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      removed = true;
    }
  }
  return removed;
}

function rawOffsetForLogicalOffset(
  text: string,
  logicalOffset: number,
): number {
  if (logicalOffset <= 0) return 0;
  let logical = 0;
  for (let raw = 0; raw < text.length; raw++) {
    if (text[raw] === WORD_JOINER) continue;
    logical++;
    if (logical === logicalOffset) return raw + 1;
  }
  return text.length;
}

function logicalOffsetForDomPosition(
  root: HTMLElement,
  container: Node,
  offset: number,
): number {
  const probe = document.createRange();
  probe.selectNodeContents(root);
  probe.setEnd(container, offset);
  return probe.toString().replace(WORD_JOINER_RE, "").length;
}

function selectionOffsets(root: HTMLElement): LogicalRange {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    const end = textFromRoot(root).length;
    return { start: end, end };
  }
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    const end = textFromRoot(root).length;
    return { start: end, end };
  }
  return {
    start: logicalOffsetForDomPosition(
      root,
      range.startContainer,
      range.startOffset,
    ),
    end: logicalOffsetForDomPosition(root, range.endContainer, range.endOffset),
  };
}

function domPositionForLogicalOffset(
  root: HTMLElement,
  offset: number,
): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  let lastText: Text | null = null;
  while (node !== null) {
    const text = node.textContent ?? "";
    const logicalLength = text.replace(WORD_JOINER_RE, "").length;
    if (logicalLength > 0) {
      if (offset <= seen + logicalLength) {
        return { node, offset: rawOffsetForLogicalOffset(text, offset - seen) };
      }
      lastText = node as Text;
    }
    seen += logicalLength;
    node = walker.nextNode();
  }
  if (lastText !== null) {
    return { node: lastText, offset: lastText.textContent?.length ?? 0 };
  }
  return { node: root, offset: root.childNodes.length };
}

function setSelectionRange(
  root: HTMLElement,
  start: number,
  end: number,
): void {
  const length = textFromRoot(root).length;
  const from = Math.max(0, Math.min(start, length));
  const to = Math.max(0, Math.min(end, length));
  const anchor = domPositionForLogicalOffset(root, from);
  const focus = from === to ? anchor : domPositionForLogicalOffset(root, to);
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  range.setStart(anchor.node, anchor.offset);
  range.setEnd(focus.node, focus.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function replaceRange(
  text: string,
  from: number,
  to: number,
  insert: string,
): string {
  return text.slice(0, from) + insert + text.slice(to);
}

// Query-aware word boundaries: runs of identifier-ish characters and runs of
// punctuation are separate words, so Alt+Arrow stops at `level|:|ERROR`
// boundaries instead of jumping across the whole token.
function isSearchWordChar(char: string): boolean {
  // Unicode-aware: \p{L}/\p{N} cover CJK, Cyrillic, Greek, accented Latin, etc.
  // so Alt/Ctrl+Arrow and Alt+Backspace treat non-ASCII identifiers as words
  // (an ASCII-only class folded them into the punctuation bucket).
  return /[\p{L}\p{N}_-]/u.test(char);
}

function previousSearchWordBoundary(text: string, offset: number): number {
  let i = Math.max(0, Math.min(offset, text.length));
  while (i > 0 && /\s/.test(text[i - 1]!)) i--;
  if (i > 0 && isSearchWordChar(text[i - 1]!)) {
    while (i > 0 && isSearchWordChar(text[i - 1]!)) i--;
  } else {
    while (i > 0 && !/\s/.test(text[i - 1]!) && !isSearchWordChar(text[i - 1]!))
      i--;
  }
  return i;
}

function nextSearchWordBoundary(text: string, offset: number): number {
  let i = Math.max(0, Math.min(offset, text.length));
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (i < text.length && isSearchWordChar(text[i]!)) {
    while (i < text.length && isSearchWordChar(text[i]!)) i++;
  } else {
    while (
      i < text.length &&
      !/\s/.test(text[i]!) &&
      !isSearchWordChar(text[i]!)
    )
      i++;
  }
  return i;
}

function deletionRange(
  text: string,
  selection: LogicalRange,
  inputType: string,
): { from: number; to: number } | null {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  if (start !== end) return { from: start, to: end };

  switch (inputType) {
    case "deleteContentBackward":
      return { from: Math.max(0, start - 1), to: start };
    case "deleteContentForward":
      return { from: start, to: Math.min(text.length, start + 1) };
    case "deleteWordBackward":
      return { from: previousSearchWordBoundary(text, start), to: start };
    case "deleteWordForward":
      return { from: start, to: nextSearchWordBoundary(text, start) };
    case "deleteSoftLineBackward":
    case "deleteHardLineBackward":
      return { from: 0, to: start };
    case "deleteSoftLineForward":
    case "deleteHardLineForward":
      return { from: start, to: text.length };
    default:
      return null;
  }
}

/**
 * Is the click point past the rendered end of the text? Clicks there mean
 * "start a new entry", not "edit the last token" — detected AFTER the browser
 * placed the caret, never by preventing the mousedown.
 */
function isPastTextEnd(root: HTMLElement, x: number, y: number): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let lastRect: DOMRect | null = null;
  let node = walker.nextNode();
  while (node !== null) {
    const text = node.textContent ?? "";
    let lastVisible = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== WORD_JOINER) lastVisible = i;
    }
    if (lastVisible >= 0) {
      const range = document.createRange();
      range.setStart(node, lastVisible);
      range.setEnd(node, lastVisible + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) lastRect = rect;
    }
    node = walker.nextNode();
  }
  if (lastRect === null) return true;
  if (y > lastRect.bottom + 2) return true;
  return y >= lastRect.top - 2 && x > lastRect.right + 2;
}

function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function useQueryInputController() {
  const [autocompleteOpen, setAutocompleteOpen] = React.useState(false);
  const [highlightedOptionId, setHighlightedOptionId] = React.useState<
    string | null
  >(null);
  const [selectionSnapshot, setSelectionSnapshot] = React.useState({
    start: 0,
    end: 0,
  });

  return {
    autocompleteOpen,
    setAutocompleteOpen,
    highlightedOptionId,
    setHighlightedOptionId,
    selectionSnapshot,
    setSelectionSnapshot,
  };
}

export function QueryInput(
  props:
    | ({ mode?: "editable" } & React.ComponentProps<typeof QueryInputEditor>)
    | ({
        mode: "preview";
        tone?: "default" | "muted";
        size?: React.ComponentProps<typeof QueryInputEditor>["size"];
      } & Pick<
        React.ComponentProps<typeof QueryInputEditor>,
        "value" | "tokens"
      >),
) {
  if (props.mode === "preview") return <QueryInputPreview {...props} />;
  return <QueryInputEditor {...props} />;
}

function QueryInputPreview(
  props: Extract<React.ComponentProps<typeof QueryInput>, { mode: "preview" }>,
) {
  return (
    <QueryInputSurface
      size={props.size}
      error={false}
      trailing="none"
      tone={props.tone}
      readOnly
    >
      <div>
        <QueryInputText>
          <div className="ph-no-capture">
            <QueryTokens
              value={props.value}
              tokens={props.tokens}
              highlightedTokenId={null}
            />
          </div>
        </QueryInputText>
      </div>
    </QueryInputSurface>
  );
}

function QueryInputSurface({
  size,
  error,
  trailing,
  tone = "default",
  readOnly = false,
  children,
}: {
  size: React.ComponentProps<typeof QueryInputEditor>["size"];
  error: boolean;
  trailing: "none" | "icon" | "button";
  tone?: "default" | "muted";
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <InputControl
      contentLayout="none"
      height="auto"
      focusTarget={readOnly ? "self" : "within"}
      error={error}
    >
      <Slot
        className={cn(
          "relative",
          size === "large" ? "min-h-9 px-2 py-1.25" : "min-h-8 px-2 py-0.75",
          { "pr-20": trailing === "button", "pr-8": trailing === "icon" },
          tone === "muted" && "bg-muted/30",
        )}
      >
        {children}
      </Slot>
    </InputControl>
  );
}

function QueryInputText({ children }: { children: React.ReactNode }) {
  return (
    <Slot className="min-h-6 font-mono text-xs leading-6 break-words whitespace-pre-wrap">
      {children}
    </Slot>
  );
}

function QueryInputEditor({
  inputId,
  label,
  value: draft,
  diagnostics: visibleDiagnostics,
  tokens: segments,
  placeholder,
  action,
  onValueChange,
  onCommit,
  onRemoveToken,
  areEquivalent,
  controller,
  completions,
  size = "default",
}: {
  inputId?: string;
  label: string;
  size?: "default" | "large";
  value: string;
  /** Only diagnostics the caller has chosen to reveal. */
  diagnostics: readonly { message: string }[];
  tokens: readonly QueryToken[];
  placeholder: string;
  action?: { label: string; title: string; onClick: () => void };
  /** Invoked before completion callbacks; it need not update React state synchronously. */
  onValueChange: (value: string) => void;
  onCommit: (value: string, reason: "enter" | "blur") => string | null;
  onRemoveToken: (token: QueryToken) => void;
  areEquivalent: (left: string, right: string) => boolean;
  controller: ReturnType<typeof useQueryInputController>;
  completions: QueryCompletionPlan | null;
}) {
  const id = React.useId();
  const listboxId = `${id}-suggestions`;
  const diagnosticsId = `${id}-diagnostics`;
  const tokenHelpId = `${id}-token-help`;

  const {
    autocompleteOpen,
    setAutocompleteOpen,
    highlightedOptionId,
    setHighlightedOptionId,
    selectionSnapshot,
    setSelectionSnapshot,
  } = controller;
  const [hoveredTokenId, setHoveredTokenId] = React.useState<string | null>(
    null,
  );
  const [editorFocused, setEditorFocused] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Selection to restore after the next reprojection of a controlled edit.
  const pendingSelectionRef = React.useRef<LogicalRange | null>(null);
  // Bumped after IME composition so token spans remount instead of keeping
  // text nodes the IME mutated in place (React skips an update when the
  // last rendered string is unchanged).
  const [tokensGeneration, setTokensGeneration] = React.useState(0);

  const selectionCollapsed = selectionSnapshot.start === selectionSnapshot.end;
  const caret = selectionSnapshot.end;

  const plan = autocompleteOpen && selectionCollapsed ? completions : null;

  const options = plan?.options ?? [];
  // Highlight policy: Enter only picks what typing narrowed. Explicit user
  // highlights (arrows/hover) always win; otherwise only plans that completed
  // a partial token pre-highlight their best match. With nothing highlighted,
  // Enter falls through to committing the query.
  const highlightedId = (() => {
    if (options.some((option) => option.id === highlightedOptionId)) {
      return highlightedOptionId;
    }
    if (plan?.autoHighlight === true) return options[0]?.id ?? null;
    return null;
  })();
  // Both the per-token red pill and the global border follow the same
  // "reveal on Enter/blur" rule — mid-typing and partial structured picks
  // (level:, tags:(, has:) must not flash red. The committed query is derived
  // from valid filter state and can never be invalid, so this depends only on
  // a revealed failed commit.
  const showGlobalDiagnostics = visibleDiagnostics.length > 0;
  const showTokenDiagnostics = showGlobalDiagnostics;

  const planRef = useLatest(plan);
  const highlightedRef = useLatest(highlightedId);
  const optionsRef = useLatest(options);
  const draftRef = useLatest(draft);

  // Draft undo/redo: snapshots of {text, selection} captured before each
  // controlled mutation. Single-character typing coalesces into one step.
  // The DOM is a projection, so the browser's native history is disabled
  // (beforeinput historyUndo/historyRedo) and replaced by this stack.
  const historyRef = React.useRef<{
    undo: Array<{ text: string; selection: LogicalRange }>;
    redo: Array<{ text: string; selection: LogicalRange }>;
    coalesce: "typing" | null;
  }>({ undo: [], redo: [], coalesce: null });
  const lastDraftRef = React.useRef(draft);
  // True once the user has focused/edited the bar. Until then, external draft
  // rewrites (the initial URL hydration) only move the baseline — they are NOT
  // pushed onto the undo stack, so a first Cmd+Z can't revert to the
  // pre-hydration empty draft and (via blur-commit) wipe the applied filters.
  const hasInteractedRef = React.useRef(false);

  const setDraftWithSelection = React.useCallback(
    (
      next: string,
      start: number,
      end = start,
      history: "push" | "coalesce" | "none" = "push",
    ) => {
      const bounded = (n: number) => Math.max(0, Math.min(n, next.length));
      if (history !== "none") {
        const stacks = historyRef.current;
        const continuingBurst =
          history === "coalesce" && stacks.coalesce === "typing";
        if (!continuingBurst) {
          const root = rootRef.current;
          const selection =
            root !== null && document.activeElement === root
              ? selectionOffsets(root)
              : {
                  start: draftRef.current.length,
                  end: draftRef.current.length,
                };
          stacks.undo.push({ text: draftRef.current, selection });
          if (stacks.undo.length > 100) stacks.undo.shift();
        }
        stacks.redo = [];
        stacks.coalesce = history === "coalesce" ? "typing" : null;
      }
      lastDraftRef.current = next;
      pendingSelectionRef.current = {
        start: bounded(start),
        end: bounded(end),
      };
      draftRef.current = next;
      onValueChange(next);
    },
    [draftRef, onValueChange],
  );

  // External replacements after interaction are undoable; initial hydration is
  // not, or the first undo could clear a query the user never edited.
  /* oxlint-disable react-you-might-not-need-an-effect/no-event-handler -- Records external controlled-value replacements in the editor's local undo history. */
  React.useEffect(() => {
    if (draft === lastDraftRef.current) return;
    if (hasInteractedRef.current) {
      const stacks = historyRef.current;
      const previous = lastDraftRef.current;
      stacks.undo.push({
        text: previous,
        selection: { start: previous.length, end: previous.length },
      });
      if (stacks.undo.length > 100) stacks.undo.shift();
      stacks.redo = [];
      stacks.coalesce = null;
    }
    lastDraftRef.current = draft;
  }, [draft]);
  /* oxlint-enable react-you-might-not-need-an-effect/no-event-handler */

  const undo = React.useCallback(() => {
    const stacks = historyRef.current;
    const entry = stacks.undo.pop();
    if (entry === undefined) return;
    const root = rootRef.current;
    const selection =
      root !== null && document.activeElement === root
        ? selectionOffsets(root)
        : { start: draftRef.current.length, end: draftRef.current.length };
    stacks.redo.push({ text: draftRef.current, selection });
    stacks.coalesce = null;
    setDraftWithSelection(
      entry.text,
      entry.selection.start,
      entry.selection.end,
      "none",
    );
  }, [draftRef, setDraftWithSelection]);

  const redo = React.useCallback(() => {
    const stacks = historyRef.current;
    const entry = stacks.redo.pop();
    if (entry === undefined) return;
    const root = rootRef.current;
    const selection =
      root !== null && document.activeElement === root
        ? selectionOffsets(root)
        : { start: draftRef.current.length, end: draftRef.current.length };
    stacks.undo.push({ text: draftRef.current, selection });
    stacks.coalesce = null;
    setDraftWithSelection(
      entry.text,
      entry.selection.start,
      entry.selection.end,
      "none",
    );
  }, [draftRef, setDraftWithSelection]);

  const undoRef = useLatest(undo);
  const redoRef = useLatest(redo);

  const openAutocompleteAfterEdit = React.useCallback(() => {
    setAutocompleteOpen(true);
    setHighlightedOptionId(null);
  }, [setAutocompleteOpen, setHighlightedOptionId]);

  // Restore selection after a controlled mutation reprojected the DOM, and
  // after an IME remount of the token spans. Runs before paint so the caret
  // never visibly jumps. External draft changes (URL nav) leave
  // pendingSelectionRef null and the browser keeps whatever selection it had.
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const pending = pendingSelectionRef.current;
    if (root === null || pending === null) return;
    if (document.activeElement !== root) return;
    pendingSelectionRef.current = null;
    setSelectionRange(root, pending.start, pending.end);
    setSelectionSnapshot(pending);
  }, [draft, tokensGeneration, setSelectionSnapshot]);

  // Mirror the native selection. Read-only: this effect never moves the
  // selection, it only snapshots it for completion planning and hover/focus
  // affordances.
  React.useEffect(() => {
    const onSelectionChange = () => {
      const root = rootRef.current;
      if (root === null || document.activeElement !== root) return;
      const next = selectionOffsets(root);
      setSelectionSnapshot((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      );
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, [setSelectionSnapshot]);

  // Safety net for mutations that bypass beforeinput (IME composition,
  // browser quirks): re-read the DOM and reproject. Skipped mid-composition
  // so IMEs keep their composing run.
  const syncFromDom = React.useCallback(() => {
    const root = rootRef.current;
    if (root === null) return;
    const next = textFromRoot(root);
    const caretNow = selectionOffsets(root).end;
    const stripped = stripUnmanagedRootChildren(root);
    if (next === draftRef.current && !stripped) return;
    setTokensGeneration((generation) => generation + 1);
    if (next === draftRef.current) {
      pendingSelectionRef.current = { start: caretNow, end: caretNow };
      return;
    }
    setDraftWithSelection(next, caretNow);
    openAutocompleteAfterEdit();
  }, [draftRef, openAutocompleteAfterEdit, setDraftWithSelection]);

  const applyTextInsert = React.useCallback(
    (insert: string) => {
      const root = rootRef.current;
      if (root === null) return;
      const offsets = selectionOffsets(root);
      const from = Math.min(offsets.start, offsets.end);
      const to = Math.max(offsets.start, offsets.end);
      const current = draftRef.current;
      const next = replaceRange(current, from, to, insert);
      // Plain single-character typing at a collapsed caret coalesces into one
      // undo step; spaces and replacements start a fresh step.
      const coalesce = insert.length === 1 && !/\s/.test(insert) && from === to;
      setDraftWithSelection(
        next,
        from + insert.length,
        undefined,
        coalesce ? "coalesce" : "push",
      );
      openAutocompleteAfterEdit();
    },
    [draftRef, openAutocompleteAfterEdit, setDraftWithSelection],
  );

  const applyTextDeletion = React.useCallback(
    (range: { from: number; to: number }) => {
      if (range.from === range.to) return;
      setDraftWithSelection(
        replaceRange(draftRef.current, range.from, range.to, ""),
        range.from,
      );
      openAutocompleteAfterEdit();
    },
    [draftRef, openAutocompleteAfterEdit, setDraftWithSelection],
  );

  // `beforeinput` is the single text-mutation boundary. It is deliberately
  // narrow: it intercepts mutations only, never selection or caret movement.
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onBeforeInput = (event: Event) => {
      const native = event as InputEvent;
      if (native.isComposing) return;
      const type = native.inputType;

      if (type === "insertText" || type === "insertReplacementText") {
        event.preventDefault();
        // Collapse only line-breaking whitespace/tabs (the single-line surface
        // can't render them); preserve spaces inside quoted values verbatim.
        applyTextInsert((native.data ?? "").replace(/[\n\r\t]+/g, " "));
        return;
      }
      if (type === "insertParagraph" || type === "insertLineBreak") {
        event.preventDefault(); // single-line surface; Enter commits via keydown
        return;
      }
      if (type === "insertFromPaste" || type === "insertFromDrop") {
        event.preventDefault(); // paste runs through onPaste; drop is unsupported
        return;
      }
      if (type === "historyUndo" || type === "historyRedo") {
        event.preventDefault(); // the DOM is a projection; native undo would desync it
        if (type === "historyUndo") undoRef.current();
        else redoRef.current();
        return;
      }
      if (type.startsWith("delete")) {
        event.preventDefault();
        const current = draftRef.current;
        const selection = selectionOffsets(root);
        const collapsed = selection.start === selection.end;
        // Collapsed word-deletes use query-aware boundaries (same boundaries
        // as Alt+Arrow movement). Everything else trusts the browser's own
        // target range when it provides one.
        if (
          collapsed &&
          (type === "deleteWordBackward" || type === "deleteWordForward")
        ) {
          const range = deletionRange(current, selection, type);
          if (range !== null) applyTextDeletion(range);
          return;
        }
        const targets = native.getTargetRanges?.() ?? [];
        if (targets.length > 0) {
          const target = targets[0]!;
          const from = logicalOffsetForDomPosition(
            root,
            target.startContainer,
            target.startOffset,
          );
          const to = logicalOffsetForDomPosition(
            root,
            target.endContainer,
            target.endOffset,
          );
          // The browser's target range can span a zero-width WORD_JOINER (the
          // caret sits just after a token's trailing joiner — reachable with
          // ArrowRight or a click past the end). That maps to an EMPTY logical
          // range, so applying it would be a silent no-op and the delete would
          // look stuck. Fall through to the logical caret delete in that case.
          if (from !== to) {
            applyTextDeletion({
              from: Math.min(from, to),
              to: Math.max(from, to),
            });
            return;
          }
        }
        const range = deletionRange(current, selection, type);
        if (range !== null) applyTextDeletion(range);
        return;
      }
    };
    root.addEventListener("beforeinput", onBeforeInput);
    return () => root.removeEventListener("beforeinput", onBeforeInput);
  }, [applyTextDeletion, applyTextInsert, draftRef, redoRef, undoRef]);

  const commit = React.useCallback(
    (advanceToTrailingSpace = false) => {
      const root = rootRef.current;
      // An IME can leave a DOM-only edit that has not reached the controlled value.
      let caretAtEnd = false;
      if (root !== null) {
        const text = textFromRoot(root);
        const sel = selectionOffsets(root);
        caretAtEnd =
          sel.start === sel.end && sel.end === text.length && text.length > 0;
        if (stripUnmanagedRootChildren(root)) {
          setTokensGeneration((generation) => generation + 1);
        }
        if (text !== draftRef.current) {
          draftRef.current = text;
          onValueChange(text);
        }
      }
      // Null means the caller rejected the commit; otherwise it returns canonical text.
      const committedText = onCommit(
        draftRef.current,
        advanceToTrailingSpace ? "enter" : "blur",
      );
      if (committedText === null) return;
      setHighlightedOptionId(null);
      // Close the undo-coalesce window at the commit boundary, mirroring undo()/
      // redo()/the external-draft sync. Otherwise a post-commit keystroke keeps
      // coalescing across the commit, so Cmd+Z jumps past the natural break.
      historyRef.current.coalesce = null;
      if (advanceToTrailingSpace && caretAtEnd) {
        // Enter committed at the END of the query: land on the resting trailing
        // space OUTSIDE the last block, field suggestions open — same as a
        // pick-at-end / ArrowRight-at-end. Prefer the user's TYPED form (keeps a
        // typed alias like `env:` instead of expanding it to `environment:`) when
        // it is semantically identical to the committed text. When the commit
        // RESTRUCTURED the query (e.g. reordered free text after filters) the
        // typed form differs, so use the canonical committed text. Either way the
        // text we set is AST-/string-equal to what resetTo re-derives, so the
        // echo no-ops and the caret stays at the end. Both already carry the
        // resting trailing space. Mid-query commits and blur keep the caret put.
        const typed = draftRef.current;
        const typedSpaced = /\s$/.test(typed) ? typed : `${typed} `;
        const restingText = areEquivalent(typedSpaced, committedText)
          ? typedSpaced
          : committedText;
        // Skip the write when the draft is already the resting text (e.g. Enter
        // on a query that already ends in a space) — otherwise it pushes a no-op
        // undo entry and the first Cmd+Z does nothing. Mirrors the no-op guards
        // in the ArrowRight-at-end and click-past-end handlers.
        if (restingText !== typed) {
          setDraftWithSelection(restingText, restingText.length);
        }
        setAutocompleteOpen(true);
      } else {
        setAutocompleteOpen(false);
      }
    },
    [
      draftRef,
      onValueChange,
      onCommit,
      setDraftWithSelection,
      areEquivalent,
      setAutocompleteOpen,
      setHighlightedOptionId,
    ],
  );

  const pickOption = React.useCallback(
    (option: QueryCompletion) => {
      const currentPlan = planRef.current;
      if (currentPlan === null) return;

      // The caller supplies the complete edit so display labels never dictate syntax.
      const { next, caret: caretAt, keepOpen } = option.edit;
      setDraftWithSelection(next, caretAt);
      setAutocompleteOpen(keepOpen);
      setHighlightedOptionId(null);
      option.onApplied(next);
    },
    [
      planRef,
      setDraftWithSelection,
      setAutocompleteOpen,
      setHighlightedOptionId,
    ],
  );

  const removeSegment = React.useCallback(
    (segment: QueryToken) => {
      onRemoveToken(segment);
      setHoveredTokenId(null);
      setAutocompleteOpen(false);
      setHighlightedOptionId(null);
    },
    [onRemoveToken, setAutocompleteOpen, setHighlightedOptionId],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (
      (event.metaKey || event.ctrlKey) &&
      (event.key === "z" || event.key === "Z")
    ) {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "y") {
      event.preventDefault();
      redo();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === " ") {
      event.preventDefault();
      setAutocompleteOpen(true);
      return;
    }

    // Query-aware word movement: identifier runs and punctuation runs are
    // separate words. Shift extends the native selection to the same
    // boundaries so movement and selection agree.
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      (event.altKey || event.ctrlKey) &&
      !event.metaKey
    ) {
      const root = rootRef.current;
      if (root === null) return;
      event.preventDefault();
      const selection = window.getSelection();
      const offsets = selectionOffsets(root);
      const collapsedBase =
        event.key === "ArrowLeft"
          ? Math.min(offsets.start, offsets.end)
          : Math.max(offsets.start, offsets.end);
      // Shift extends from the selection FOCUS (the moving end), which native
      // selection tracks independently of document order.
      const focusBase =
        selection !== null &&
        selection.focusNode !== null &&
        root.contains(selection.focusNode)
          ? logicalOffsetForDomPosition(
              root,
              selection.focusNode,
              selection.focusOffset,
            )
          : collapsedBase;
      const base = event.shiftKey ? focusBase : collapsedBase;
      const target =
        event.key === "ArrowLeft"
          ? previousSearchWordBoundary(draft, base)
          : nextSearchWordBoundary(draft, base);
      if (event.shiftKey && selection !== null && selection.rangeCount > 0) {
        const position = domPositionForLogicalOffset(root, target);
        selection.extend(position.node, position.offset);
      } else {
        setSelectionRange(root, target, target);
      }
      return;
    }

    // ArrowRight at the very end of the query inserts a trailing space to start
    // a NEW token — matching the muscle-memory of typing a space at the end, and
    // the same fresh-token landing as a click past the end or a pick-at-end.
    // Skip when the draft already ends in whitespace so a repeat press doesn't
    // pile up spaces. The trailing space is trimmed on commit.
    if (
      event.key === "ArrowRight" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      selectionCollapsed &&
      caret === draft.length &&
      draft.length > 0 &&
      !/\s$/.test(draft)
    ) {
      event.preventDefault();
      const next = `${draft} `;
      setDraftWithSelection(next, next.length);
      setAutocompleteOpen(true);
      setHighlightedOptionId(null);
      return;
    }

    // Plain Left/Right move ONE logical position, skipping the zero-width
    // WORD_JOINERs (and the redundant inter-block DOM spots they create: a pill
    // is followed by its trailing joiner AND the separating space, all sharing
    // one logical offset). Native movement stalls on those — e.g. ArrowLeft from
    // the start of a block takes two presses to actually cross into the previous
    // block. Moving by logical offset makes every press advance exactly one
    // character in both directions. (A non-collapsed selection collapses
    // natively; modifier/at-end arrows are handled above.)
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const root = rootRef.current;
      if (root === null) return;
      const { start, end } = selectionOffsets(root);
      if (start !== end) return; // let native collapse a selection
      let target =
        event.key === "ArrowLeft"
          ? Math.max(0, end - 1)
          : Math.min(draft.length, end + 1);
      // Step over a whole non-BMP character (emoji, supplementary CJK): offsets
      // count UTF-16 code units, so a ±1 step can land BETWEEN a surrogate pair.
      // Native arrow movement is grapheme-aware; restore that for the common
      // single-codepoint case so one press crosses the character.
      if (
        event.key === "ArrowLeft" &&
        target > 0 &&
        isLowSurrogate(draft.charCodeAt(target)) &&
        isHighSurrogate(draft.charCodeAt(target - 1))
      ) {
        target -= 1;
      } else if (
        event.key === "ArrowRight" &&
        target < draft.length &&
        isHighSurrogate(draft.charCodeAt(target - 1)) &&
        isLowSurrogate(draft.charCodeAt(target))
      ) {
        target += 1;
      }
      if (target === end) return; // at an edge — native no-op
      event.preventDefault();
      setSelectionRange(root, target, target);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option = optionsRef.current.find(
        (o) => o.id === highlightedRef.current,
      );
      if (
        autocompleteOpen &&
        planRef.current !== null &&
        option !== undefined
      ) {
        pickOption(option);
        return;
      }
      // No suggestion to take: commit the query. When the caret is at the end,
      // land on a fresh trailing space so the next filter starts outside the
      // last block (matches a pick-at-end / ArrowRight-at-end).
      commit(true);
      return;
    }

    if (event.key === "Escape") {
      if (autocompleteOpen) {
        event.preventDefault();
        setAutocompleteOpen(false);
      }
      return;
    }

    // Forward Tab picks the highlighted option; Shift+Tab must stay native
    // backward focus (key is "Tab" for both, so guard on shiftKey).
    if (event.key === "Tab" && !event.shiftKey) {
      const option = optionsRef.current.find(
        (o) => o.id === highlightedRef.current,
      );
      if (planRef.current !== null && option !== undefined) {
        event.preventDefault();
        pickOption(option);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const ids = optionsRef.current.map((o) => o.id);
      if (!autocompleteOpen) {
        setAutocompleteOpen(true);
        return;
      }
      if (ids.length === 0) return;
      const current = highlightedRef.current;
      const idx = current === null ? -1 : ids.indexOf(current);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = (() => {
        if (idx === -1) {
          if (delta > 0) {
            return 0;
          }
          return ids.length - 1;
        }
        return (idx + delta + ids.length) % ids.length;
      })();
      setHighlightedOptionId(ids[next]!);
    }
  };

  const onCopy = (event: React.ClipboardEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (root === null) return;
    const { start, end } = selectionOffsets(root);
    if (start === end) return;
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      draft.slice(Math.min(start, end), Math.max(start, end)),
    );
  };

  const onCut = (event: React.ClipboardEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (root === null) return;
    const { start, end } = selectionOffsets(root);
    if (start === end) return;
    event.preventDefault();
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    event.clipboardData.setData("text/plain", draft.slice(from, to));
    applyTextDeletion({ from, to });
  };

  const onPaste = (event: React.ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    // Collapse only line-breaking whitespace/tabs (single-line surface);
    // preserve spaces inside quoted values (e.g. pasting `name:"a  b"`).
    const clean = event.clipboardData
      .getData("text/plain")
      .replace(/[\n\r\t]+/g, " ");
    applyTextInsert(clean);
  };

  const onFocus = () => {
    setEditorFocused(true);
    hasInteractedRef.current = true;
    // A draft was set while the editor was blurred (an external structured
    // edit): the restore effect could not run then, so consume the pending
    // selection now that focus arrived.
    const root = rootRef.current;
    const pending = pendingSelectionRef.current;
    if (root !== null && pending !== null) {
      pendingSelectionRef.current = null;
      setSelectionRange(root, pending.start, pending.end);
      setSelectionSnapshot(pending);
    }
    setAutocompleteOpen(true);
  };

  const onBlur = () => {
    setEditorFocused(false);
    commit();
    setAutocompleteOpen(false);
  };

  // Click handling happens AFTER the browser placed the caret (click, not
  // mousedown), so native click/drag/double-click selection is untouched.
  // A collapsed click opens caret-contextual suggestions; a click past the
  // end of the text means "start a new entry".
  const onRootClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("button"))
      return;
    const root = rootRef.current;
    if (root === null) return;
    const { start, end } = selectionOffsets(root);
    if (start !== end) return; // drag selection — selection is for editing, not suggesting
    const pastEnd =
      draft.length > 0 && isPastTextEnd(root, event.clientX, event.clientY);
    if (pastEnd) {
      // A click in the empty space past the text means "start a new entry":
      // land on a trailing space OUTSIDE the last block (adding one if the query
      // doesn't already end in whitespace), with field suggestions open — the
      // same fresh-token landing as ArrowRight-at-end and a pick-at-end. Without
      // the physical space the browser drops the caret inside the last pill, so
      // typing would edit what's there. The space is trimmed on commit.
      if (/\s$/.test(draft)) {
        setSelectionRange(root, draft.length, draft.length);
        setSelectionSnapshot({ start: draft.length, end: draft.length });
      } else {
        const next = `${draft} `;
        setDraftWithSelection(next, next.length);
      }
      setAutocompleteOpen(true);
      setHighlightedOptionId(null);
      return;
    }
    if (end < draft.length && /\s/.test(draft[end] ?? "")) {
      // Additive gap affordance: a click in the whitespace BETWEEN tokens
      // (geometrically past the previous token's right edge, not on the token
      // or its padding) nudges the collapsed caret across the whitespace run,
      // so typing starts the next entry instead of gluing to the previous
      // token. Clicks on token text keep their native caret untouched.
      const segment = segments.find((s) => s.to === end);
      const el =
        segment !== undefined
          ? root.querySelector(`[data-segment-id="${CSS.escape(segment.id)}"]`)
          : null;
      const rects = el?.getClientRects();
      const rect =
        rects !== undefined && rects.length > 0
          ? rects[rects.length - 1]!
          : null;
      if (
        rect !== null &&
        event.clientY >= rect.top - 2 &&
        event.clientY <= rect.bottom + 2 &&
        event.clientX > rect.right + 1
      ) {
        let next = end;
        while (next < draft.length && /\s/.test(draft[next]!)) next++;
        setSelectionRange(root, next, next);
        setSelectionSnapshot({ start: next, end: next });
      }
    }
    setAutocompleteOpen(true);
    setHighlightedOptionId(null);
  };

  const onRootMouseOver = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-overlay-remove]")) return; // keep the X alive under the pointer
    const token = target?.closest("[data-segment-id]");
    setHoveredTokenId(token?.getAttribute("data-segment-id") ?? null);
  };

  // The token holding a collapsed caret — the keyboard counterpart to hover.
  // Not at the trailing insertion point, where the user is appending, not
  // editing. Every segment kind qualifies: an operator explains itself on the
  // caret path exactly as it does on hover (it just can't be removed, below).
  const caretSegment =
    editorFocused && selectionCollapsed && caret < draft.length
      ? (segments.find((s) => s.from <= caret && caret <= s.to) ?? null)
      : null;
  // The remove affordance targets the hovered token, or the caret token — but
  // only an editable one, since operators/parens have nothing to remove.
  const focusTokenId = caretSegment?.editable === true ? caretSegment.id : null;
  const removeTargetId = hoveredTokenId ?? focusTokenId;
  const removeTarget =
    segments.find((s) => s.editable && s.id === removeTargetId) ?? null;
  // The hovered/caret token's diagnostic, shown as a styled per-token tooltip
  // once diagnostics are revealed — replaces the native title.
  // Shown even while the suggestions popover is open (you still need to see why
  // the block is red); the tooltip flips ABOVE the block then, so it doesn't
  // collide with the popover that drops BELOW the bar (see the render below).
  const errorTarget =
    showTokenDiagnostics && removeTarget?.error !== null ? removeTarget : null;

  // Plain-language explanation of a token (LFE-14447), in the same slot — an
  // error wins it. Hover always explains; the caret path only while the popover
  // is closed, so it never stacks a tooltip over the suggestions you are typing
  // against.
  const explainTarget = (() => {
    if (errorTarget !== null) return null;
    if (hoveredTokenId !== null) {
      return segments.find((segment) => segment.id === hoveredTokenId) ?? null;
    }
    if (plan === null) return caretSegment;
    return null;
  })();
  const explainTargetId = explainTarget?.id ?? null;
  const explanation = explainTarget === null ? null : explainTarget.explanation;
  const explainDeactivatedReason =
    explainTarget === null ? null : explainTarget.inactiveReason;
  // Keyboard/AT path: the caret token's explanation, read through the combobox's
  // description regardless of the popover — including the "not applied" note,
  // which the visible tooltip also carries.
  const caretExplanation =
    caretSegment === null ? null : caretSegment.explanation;
  const caretDeactivatedReason =
    caretSegment === null ? null : caretSegment.inactiveReason;
  const caretHelp =
    caretExplanation === null
      ? null
      : [
          `${caretExplanation.subject} ${caretExplanation.predicate}`.trim(),
          caretDeactivatedReason === null
            ? null
            : notAppliedNote(caretDeactivatedReason),
        ]
          .filter((part) => part !== null)
          .join(" ");
  const describedBy =
    [
      visibleDiagnostics.length > 0 ? diagnosticsId : null,
      caretHelp !== null ? tokenHelpId : null,
    ]
      .filter((id) => id !== null)
      .join(" ") || undefined;

  // Measure the remove target's last client rect in the parent's layout
  // effect: it runs after every commit that can move text, and after all
  // subtree refs (root + container) are attached.
  const [removePosition, setRemovePosition] = React.useState<{
    left: number;
    top: number;
  } | null>(null);
  // Anchors for the per-token tooltip — left edge of the token, plus its
  // bottom (default placement, just under the block) and top (used to flip the
  // tooltip ABOVE the block while the suggestions popover is open below). These
  // are VIEWPORT coordinates (not container-relative): the tooltip portals to
  // document.body and is positioned `fixed`, so it reads the token's own
  // getClientRects() directly. The bar's band is sticky (it doesn't scroll out
  // from under the token), so a fixed anchor stays put; it re-measures on draft
  // change and the container ResizeObserver below, same as the X button.
  const [tooltipPosition, setTooltipPosition] = React.useState<{
    left: number;
    belowTop: number;
    aboveTop: number;
  } | null>(null);
  const removeTargetIdActual = removeTarget?.id ?? null;
  // Measured separately from the remove target: an operator token explains
  // itself but is not editable, so it never has a remove X to anchor to.
  const tooltipTargetId = (() => {
    if (errorTarget !== null) {
      return errorTarget.id;
    }
    if (explanation !== null) {
      return explainTargetId;
    }
    return null;
  })();
  const measurePositions = React.useCallback(() => {
    const root = rootRef.current;
    const container = containerRef.current;
    const rectsOf = (id: string | null): DOMRectList | null => {
      if (root === null || id === null) return null;
      const el = root.querySelector(`[data-segment-id="${CSS.escape(id)}"]`);
      return el === null ? null : el.getClientRects();
    };

    const removeRects = rectsOf(removeTargetIdActual);
    const lastRect = removeRects?.[removeRects.length - 1] ?? null;
    if (container === null || lastRect === null) {
      setRemovePosition(null);
    } else {
      const containerRect = container.getBoundingClientRect();
      setRemovePosition({
        left: lastRect.right - containerRect.left - 6,
        top: lastRect.top - containerRect.top - 8,
      });
    }

    const tooltipRect = rectsOf(tooltipTargetId)?.[0] ?? null;
    setTooltipPosition(
      tooltipRect === null
        ? null
        : {
            left: tooltipRect.left,
            belowTop: tooltipRect.bottom + 6,
            aboveTop: tooltipRect.top,
          },
    );
  }, [removeTargetIdActual, tooltipTargetId]);

  // Re-measure when a target or the draft text changes.
  React.useLayoutEffect(() => {
    measurePositions();
  }, [measurePositions, draft]);

  // Those deps miss layout reflows that don't change React state — window
  // resize, browser zoom, sidebar collapse — which re-wrap the full-width bar
  // and move the token. Observe the composer surface so the absolutely-
  // positioned X re-anchors to its token instead of leaving a stale ghost X.
  React.useEffect(() => {
    if (removeTargetIdActual === null && tooltipTargetId === null) return;
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measurePositions());
    observer.observe(container);
    return () => observer.disconnect();
  }, [measurePositions, removeTargetIdActual, tooltipTargetId]);

  return (
    <div
      ref={containerRef}
      data-testid="search-bar"
      role="search"
      className="ph-no-capture relative w-full"
    >
      <QueryInputSurface
        size={size}
        error={showGlobalDiagnostics}
        trailing={
          action !== undefined && !showGlobalDiagnostics ? "button" : "icon"
        }
      >
        <div
          data-testid="search-bar-surface"
          data-composer-text={draft}
          onMouseLeave={() => setHoveredTokenId(null)}
        >
          {draft.length === 0 && (
            <div
              className={cn(
                // Bound the right edge (not just pr-*) so `truncate` has a width
                // to clip against — otherwise the placeholder grows to its full
                // text width and runs under the top-right "Ask AI" button. The
                // reserved gap matches the surface's pr-20/pr-8.
                "text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 truncate font-mono text-xs",
                // Mirror the surface's right reservation exactly: the "Ask AI"
                // button (right-20) is hidden while diagnostics show, when the
                // error icon takes over the top-right corner (right-8).
                action !== undefined && !showGlobalDiagnostics
                  ? "right-20"
                  : "right-8",
              )}
              title={placeholder}
            >
              {placeholder}
            </div>
          )}
          <QueryInputText>
            <div
              ref={rootRef}
              id={inputId}
              role="combobox"
              aria-label={label}
              aria-invalid={showGlobalDiagnostics || undefined}
              aria-expanded={plan !== null}
              aria-controls={plan !== null ? listboxId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                plan !== null && highlightedId !== null
                  ? optionDomId(listboxId, highlightedId)
                  : undefined
              }
              aria-describedby={describedBy}
              contentEditable
              suppressContentEditableWarning
              // The query is code-like grammar, not prose: suppress every mobile-
              // keyboard mutation, not just the spellcheck squiggle. Without these,
              // iOS/Android default autocorrect + sentence-capitalization can
              // rewrite a partial token (`tps` → something) before commit.
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              inputMode="text"
              data-testid="search-bar-input"
              className="ph-no-capture caret-[hsl(var(--foreground))] outline-none"
              onInput={(event) => {
                if (!(event.nativeEvent as InputEvent).isComposing)
                  syncFromDom();
              }}
              onCompositionEnd={syncFromDom}
              // Disable drag-and-drop: an intra-bar drag fires deleteByDrag (which
              // the delete branch applies) without a matching insert, silently
              // dropping the dragged text. Drop is unsupported anyway; selection
              // and copy/cut/paste stay fully functional.
              onDragStart={(e) => e.preventDefault()}
              onKeyDown={onKeyDown}
              onCopy={onCopy}
              onCut={onCut}
              onPaste={onPaste}
              onFocus={onFocus}
              onBlur={onBlur}
              onClick={onRootClick}
              onMouseOver={onRootMouseOver}
            >
              <React.Fragment key={tokensGeneration}>
                <QueryTokens
                  value={draft}
                  tokens={segments}
                  highlightedTokenId={
                    explanation !== null ? explainTargetId : errorTarget?.id
                  }
                />
              </React.Fragment>
            </div>
          </QueryInputText>
          {/* "Ask AI" affordance — a plain button, always available so filters can
            be built from scratch OR refined. Placed AFTER the field in the DOM so
            forward Tab moves from the field onto this button (not past the bar).
            Deliberately NOT a Tab shortcut: while typing, Tab belongs to
            autocomplete navigation. Hidden while the error icon occupies the
            corner. bg-background keeps it legible; onMouseDown preventDefault so a
            click doesn't blur the editor first. */}
          {action !== undefined && !showGlobalDiagnostics && (
            <button
              type="button"
              data-testid="search-bar-ask-ai"
              aria-label={action.title}
              title={action.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
              }}
              className={cn(
                "absolute right-2 z-20 inline-flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5",
                size === "large" ? "top-1.25" : "top-0.75",
                "bg-background text-muted-foreground font-sans text-xs",
                "hover:text-foreground transition-colors",
                // Match the app's focus ring (ring-ring) instead of the browser's
                // default blue outline, like the shared Button used elsewhere.
                "ring-offset-background focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
              )}
            >
              <WandSparkles size="base" aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          )}
          {/* Bar-local overlay stacking ladder: token text (base) < remove-X
            (z-20). The autocomplete and token tooltip both render through app
            overlay layers so they escape clipped table, panel, and dialog
            ancestors. */}
          {removeTarget !== null && removePosition !== null && (
            <RemoveTokenButton
              segment={removeTarget}
              position={removePosition}
              onRemove={removeSegment}
            />
          )}
        </div>
      </QueryInputSurface>

      {showGlobalDiagnostics && (
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          <span
            className="text-destructive"
            title={visibleDiagnostics.map((d) => d.message).join("; ")}
            aria-label="invalid query"
          >
            <AlertCircle size="base" />
          </span>
        </div>
      )}

      {visibleDiagnostics.length > 0 && (
        <div id={diagnosticsId} className="sr-only">
          {visibleDiagnostics.map((d) => d.message).join("; ")}
        </div>
      )}

      {caretHelp !== null && (
        <div id={tokenHelpId} className="sr-only">
          {caretHelp}
        </div>
      )}

      {plan !== null && (
        <QueryInputSuggestions onDismiss={() => setAutocompleteOpen(false)}>
          <QueryInputListbox
            plan={plan}
            highlightedId={highlightedId}
            onPick={pickOption}
            onHighlight={setHighlightedOptionId}
            listboxId={listboxId}
            label={`${label} suggestions`}
          />
        </QueryInputSuggestions>
      )}

      {/* Per-token tooltip — the error diagnostic, or the token's plain-language
          explanation. The "tooltip" <Layer> renders it on a body-level container
          so it escapes the page header's overflow:hidden clip and z-50 stacking
          context when it flips above the bar — an in-flow z-index can't win
          against either. `fixed` + viewport anchors. pointer-events-none so
          moving onto it doesn't change the hovered token (which would flicker it
          away). */}
      {(errorTarget !== null || explanation !== null) &&
        tooltipPosition !== null && (
          <Layer name="tooltip">
            <div
              role="tooltip"
              data-testid="search-bar-token-tooltip"
              style={
                plan !== null
                  ? {
                      left: tooltipPosition.left,
                      top: tooltipPosition.aboveTop,
                      transform: "translateY(calc(-100% - 6px))",
                    }
                  : {
                      left: tooltipPosition.left,
                      top: tooltipPosition.belowTop,
                    }
              }
              className={cn(
                "ph-no-capture pointer-events-none fixed max-w-[min(360px,calc(100vw-32px))]",
                "bg-popover rounded-md border",
                "px-2 py-1 font-sans text-xs leading-snug shadow-md",
                errorTarget !== null
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-popover-foreground",
              )}
            >
              {errorTarget !== null ? (
                errorTarget.error
              ) : (
                <>
                  <span className="font-bold">{explanation?.subject}</span>
                  {/* A boolean token's phrase IS the whole explanation — no
                      predicate, so no dangling space before the period. */}
                  {explanation?.predicate !== "" && (
                    <> {explanation?.predicate}</>
                  )}
                  {explainDeactivatedReason !== null && (
                    <span className="text-muted-foreground block pt-0.5">
                      {notAppliedNote(explainDeactivatedReason)}
                    </span>
                  )}
                </>
              )}
            </div>
          </Layer>
        )}
    </div>
  );
}

function QueryInputListbox({
  plan,
  highlightedId,
  onPick,
  onHighlight,
  listboxId,
  label,
}: {
  plan: QueryCompletionPlan;
  highlightedId: string | null;
  onPick: (option: QueryCompletion) => void;
  onHighlight: (id: string) => void;
  listboxId: string;
  label: string;
}) {
  const lastPointer = React.useRef<{ x: number; y: number } | null>(null);
  const scrollHighlightedOption = React.useCallback(
    (element: HTMLDivElement | null) => {
      element?.scrollIntoView({ block: "nearest" });
    },
    [],
  );
  const sections = new Map<string, QueryCompletion[]>();
  for (const option of plan.options) {
    const title = option.section ?? "";
    const options = sections.get(title) ?? [];
    options.push(option);
    sections.set(title, options);
  }
  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label={label}
      className="ph-no-capture max-h-[min(420px,40vh)] overflow-x-hidden overflow-y-auto py-1"
    >
      {plan.loading && (
        <div
          className="text-muted-foreground mx-1 flex min-h-8 items-center gap-2 px-3 text-xs"
          role="status"
        >
          Loading values…
        </div>
      )}
      {!plan.loading && plan.options.length === 0 && (
        <div
          className="text-muted-foreground mx-1 flex min-h-8 items-center gap-2 px-3 text-xs"
          role="status"
        >
          No suggestions
        </div>
      )}
      {Array.from(sections, ([title, options], index) => (
        <div
          key={title}
          role="group"
          aria-label={title || undefined}
          className={cn(index > 0 && "mt-1.5 border-t pt-1.5")}
        >
          {title && (
            <div className="text-muted-foreground px-3 pt-1.5 pb-1 text-[10px] tracking-[0.06em] uppercase">
              {title}
            </div>
          )}
          {options.map((option) => {
            const Icon = suggestionIcons[option.icon ?? "search"];
            return (
              <div
                key={option.id}
                ref={
                  option.id === highlightedId
                    ? scrollHighlightedOption
                    : undefined
                }
                id={optionDomId(listboxId, option.id)}
                role="option"
                aria-selected={option.id === highlightedId}
                className={cn(
                  "mx-1 flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2 font-mono text-xs leading-[1.4]",
                  option.id === highlightedId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(option)}
                onMouseMove={(event) => {
                  // Layout shifts can fire mouse events without pointer movement;
                  // those must not arm Enter on an option the user never chose.
                  const last = lastPointer.current;
                  if (
                    last !== null &&
                    last.x === event.clientX &&
                    last.y === event.clientY
                  )
                    return;
                  lastPointer.current = { x: event.clientX, y: event.clientY };
                  onHighlight(option.id);
                }}
              >
                <Icon __rawClassName="flex-none opacity-55" aria-hidden />
                <span
                  title={option.label}
                  className={cn(
                    "max-w-[480px] min-w-0 flex-none truncate",
                    QUERY_LABEL_COLORS[option.labelColor ?? "default"],
                  )}
                >
                  {option.label}
                </span>
                {option.badges?.map((badge) => (
                  <Tooltip key={badge.text} label={badge.description}>
                    {({ getTriggerProps }) => (
                      <span {...getTriggerProps()}>
                        <Badge text={badge.text} color={badge.color} />
                      </span>
                    )}
                  </Tooltip>
                ))}
                {option.selected && (
                  <Check
                    size="base"
                    __rawClassName="text-foreground/80 flex-none"
                    aria-label="selected"
                  />
                )}
                {option.detail !== undefined && (
                  <span className="text-muted-foreground ml-auto pl-6 font-sans text-[11px]">
                    {option.detail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function QueryInputSuggestions({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  const container = useLayerContainer("popover");
  const { refs, floatingStyles } = useFloating({
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  return (
    <>
      <div
        ref={refs.setReference}
        className="pointer-events-none absolute inset-y-0 left-0 w-px"
      />
      <FloatingPortal root={container}>
        <DismissableLayer
          ref={refs.setFloating}
          style={floatingStyles}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onDismiss();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          // Headers and padding must retain editor focus just like option rows.
          onMouseDown={(event) => event.preventDefault()}
          onWheel={stopScrollPropagation()}
          onTouchMove={stopScrollPropagation()}
          className="bg-popover text-popover-foreground w-max max-w-[calc(100vw-16px)] min-w-[min(420px,calc(100vw-16px))] rounded-md border p-0 shadow-md outline-hidden"
        >
          {children}
        </DismissableLayer>
      </FloatingPortal>
    </>
  );
}

/**
 * Remove control rendered OUTSIDE the contenteditable text flow: it is an
 * absolutely positioned sibling anchored to the token's measured pixels, so
 * hover/remove can never reflow text, join a selection range, or trap the
 * caret.
 */
function RemoveTokenButton({
  segment,
  position,
  onRemove,
}: {
  segment: QueryToken;
  position: { left: number; top: number };
  onRemove: (segment: QueryToken) => void;
}) {
  return (
    <button
      type="button"
      data-overlay-remove
      aria-label={`Remove ${segment.raw}`}
      title={`Remove ${segment.raw}`}
      style={{ left: position.left, top: position.top }}
      className={cn(
        "absolute z-20 inline-flex h-4 w-4 items-center justify-center rounded-sm",
        "border-border bg-background text-muted-foreground border shadow-sm",
        "hover:bg-accent hover:text-foreground focus:ring-ring focus:ring-1 focus:outline-none",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onRemove(segment);
      }}
    >
      <X size="sm" aria-hidden="true" />
    </button>
  );
}
