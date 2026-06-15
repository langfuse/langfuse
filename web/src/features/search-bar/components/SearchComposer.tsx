// Grammar-aware search composer (Datadog-style).
//
// The per-mount store owns draft/committed query state. This component owns
// autocomplete state and projects the draft string into inline token spans
// inside one contenteditable root.
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
import { useShallow } from "zustand/react/shallow";
import { AlertCircle, X } from "lucide-react";

import { cn } from "@/src/utils/tailwind";

import {
  deriveComposerSegments,
  type ComposerSegment,
} from "@/src/features/search-bar/lib/composer-segments";
import { serializeValue, termAt } from "@/src/features/search-bar/lib/langQ";
import {
  scoreTypeContextFromObserved,
  type ObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";
import { getRecentSearches } from "@/src/features/search-bar/lib/recent-searches";
import {
  flattenOptions,
  planInputCompletions,
  type CompletionOption,
  type CompletionPlan,
} from "@/src/features/search-bar/lib/completions";
import {
  useSearchBarStore,
  useSearchBarStoreApi,
  useSearchBarCommit,
} from "@/src/features/search-bar/store/SearchBarStoreProvider";
import { AutocompletePopover } from "@/src/features/search-bar/components/AutocompletePopover";
import {
  ComposerTokens,
  WORD_JOINER,
} from "@/src/features/search-bar/components/ComposerTokens";
import {
  COMPOSER_PLACEHOLDER,
  optionDomId,
} from "@/src/features/search-bar/components/presentation";

const LISTBOX_ID = "search-bar-listbox";
// Word joiners (shared with ComposerTokens) give the DOM caret boundaries
// between pills without changing the query text; stripped before the text
// reaches the model or clipboard.
const WORD_JOINER_RE = new RegExp(WORD_JOINER, "g");

// Stable empty recents reference so the plan memo doesn't churn when recents
// are intentionally suppressed (popover closed or append mode).
const NO_RECENTS: string[] = [];

type LogicalRange = { start: number; end: number };

function textFromRoot(root: HTMLElement): string {
  return (root.textContent ?? "").replace(WORD_JOINER_RE, "");
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
  return /[A-Za-z0-9_-]/.test(char);
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

export function SearchComposer({
  projectId,
  observed,
}: {
  projectId: string;
  /** Observed facet values for value suggestions; undefined = loading. */
  observed: ObservedOptions | undefined;
}) {
  const storeApi = useSearchBarStoreApi();
  const commitToFilterState = useSearchBarCommit();
  const { draft, valid, diagnostics, invalidRevealDraft } = useSearchBarStore(
    useShallow((s) => ({
      draft: s.draft,
      valid: s.draftValid,
      diagnostics: s.draftDiagnostics,
      invalidRevealDraft: s.invalidRevealDraft,
    })),
  );

  const [autocompleteOpen, setAutocompleteOpen] = React.useState(false);
  const [appendIntent, setAppendIntent] = React.useState(false);
  const [highlightedOptionId, setHighlightedOptionId] = React.useState<
    string | null
  >(null);
  const [hoveredTokenId, setHoveredTokenId] = React.useState<string | null>(
    null,
  );
  const [editorFocused, setEditorFocused] = React.useState(false);
  // Mirror of the native selection in logical (joiner-free) offsets.
  const [selectionSnapshot, setSelectionSnapshot] =
    React.useState<LogicalRange>({ start: 0, end: 0 });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Selection to restore after the next reprojection of a controlled edit.
  const pendingSelectionRef = React.useRef<LogicalRange | null>(null);

  const selectionCollapsed = selectionSnapshot.start === selectionSnapshot.end;
  const caret = selectionSnapshot.end;

  // Memoized so segment projection's one-slot cache stays warm across renders;
  // routes `scores.<name>` token validity by the same observed score type the
  // store and commit gate use.
  const scoreTypes = React.useMemo(
    () => scoreTypeContextFromObserved(observed),
    [observed],
  );

  // Read recents only while the popover is open (avoids a synchronous
  // localStorage read on every keystroke/selection render), and not in append
  // mode — a recent is a complete query, not a token to append, so showing
  // them there would let a pick silently replace the in-progress draft.
  const recents = React.useMemo(
    () =>
      autocompleteOpen && !appendIntent
        ? getRecentSearches(projectId)
        : NO_RECENTS,
    [autocompleteOpen, appendIntent, projectId],
  );

  const plan: CompletionPlan | null =
    autocompleteOpen && selectionCollapsed
      ? planInputCompletions({
          input: appendIntent ? "" : draft,
          caret: appendIntent ? 0 : Math.min(caret, draft.length),
          observed,
          recents,
          currentQueryText: draft,
        })
      : null;
  const options = flattenOptions(plan);
  // Highlight policy: Enter only picks what typing narrowed. Explicit user
  // highlights (arrows/hover) always win; otherwise only plans that completed
  // a partial token pre-highlight their best match. With nothing highlighted,
  // Enter falls through to committing the query.
  const highlightedId = options.some((o) => o.id === highlightedOptionId)
    ? highlightedOptionId
    : plan?.autoHighlight === true
      ? (options[0]?.id ?? null)
      : null;
  // Both the per-token red pill and the global border follow the same
  // "reveal on Enter/blur" rule — mid-typing and partial structured picks
  // (level:, tags:(, has:) must not flash red. The committed query is derived
  // from valid filter state and can never be invalid, so this depends only on
  // a revealed failed commit.
  const showGlobalDiagnostics = !valid && invalidRevealDraft === draft;
  const showTokenDiagnostics = showGlobalDiagnostics;
  const visibleDiagnostics = showGlobalDiagnostics ? diagnostics : [];

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
      // setDraft clears any revealed invalid state as a side effect.
      storeApi.getState().actions.setDraft(next);
    },
    [draftRef, storeApi],
  );

  // External draft rewrites (saved views, sidebar edits) the user makes AFTER
  // interacting are undoable single steps too. But the pre-interaction URL
  // hydration must NOT be captured — otherwise Cmd+Z reverts to the empty
  // initial draft and the blur-commit wipes the applied filters.
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
  }, []);

  // Restore selection after a controlled mutation reprojected the DOM. Runs
  // before paint so the caret never visibly jumps. External draft changes
  // (URL nav) leave pendingSelectionRef null and the browser keeps whatever
  // selection state it had.
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const pending = pendingSelectionRef.current;
    if (root === null || pending === null) return;
    if (document.activeElement !== root) return;
    pendingSelectionRef.current = null;
    setSelectionRange(root, pending.start, pending.end);
    setSelectionSnapshot(pending);
  }, [draft]);

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
      // Moving the caret away from the end abandons "new entry" intent.
      if (next.start !== next.end || next.end !== draftRef.current.length) {
        setAppendIntent(false);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, [draftRef]);

  // Safety net for mutations that bypass beforeinput (IME composition,
  // browser quirks): re-read the DOM and reproject. Skipped mid-composition
  // so IMEs keep their composing run.
  const syncFromDom = React.useCallback(() => {
    const root = rootRef.current;
    if (root === null) return;
    const next = textFromRoot(root);
    if (next === draftRef.current) return;
    const caretNow = selectionOffsets(root).end;
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
      const shouldAppend =
        appendIntent &&
        insert.length > 0 &&
        from === to &&
        from === current.length;
      const prefix =
        shouldAppend &&
        current.trim().length > 0 &&
        !/\s$/.test(current) &&
        !/^\s/.test(insert)
          ? " "
          : "";
      const next = replaceRange(current, from, to, prefix + insert);
      // Append intent is one-shot: any edit consumes it.
      setAppendIntent(false);
      // Plain single-character typing at a collapsed caret coalesces into one
      // undo step; spaces and replacements start a fresh step.
      const coalesce =
        insert.length === 1 &&
        !/\s/.test(insert) &&
        prefix === "" &&
        from === to;
      setDraftWithSelection(
        next,
        from + prefix.length + insert.length,
        undefined,
        coalesce ? "coalesce" : "push",
      );
      openAutocompleteAfterEdit();
    },
    [appendIntent, draftRef, openAutocompleteAfterEdit, setDraftWithSelection],
  );

  const applyTextDeletion = React.useCallback(
    (range: { from: number; to: number }) => {
      if (range.from === range.to) return;
      setAppendIntent(false);
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

  const commit = React.useCallback(() => {
    const root = rootRef.current;
    const actions = storeApi.getState().actions;
    // Sync any DOM-only edit (IME, browser quirk) into the store before
    // committing. Compare against the live store draft, not a render snapshot,
    // and rely on zustand's synchronous set so the commit reads the new value.
    if (root !== null) {
      const text = textFromRoot(root);
      if (text !== storeApi.getState().draft) actions.setDraft(text);
    }
    // The container validates, lowers, and writes the filter state; on failure
    // it reveals the invalid draft. A successful commit re-derives the
    // committed text and the resetTo effect canonicalizes the draft.
    const ok = commitToFilterState();
    if (ok) {
      setAppendIntent(false);
      setAutocompleteOpen(false);
      setHighlightedOptionId(null);
    }
  }, [storeApi, commitToFilterState]);

  // Structured edits (autocomplete picks, chip removal) apply immediately, but
  // a pick can leave the draft mid-completion (e.g. "level:" after a field
  // pick). Commit only when valid so an intermediate invalid draft never
  // reveals the red diagnostics state — that is reserved for an explicit Enter
  // (the `commit` path above) or blur. writeDraft ran synchronously, so the
  // freshly-set draftValid is current here.
  const commitStructuredEdit = React.useCallback(() => {
    if (storeApi.getState().draftValid) commitToFilterState();
  }, [storeApi, commitToFilterState]);

  const pickOption = React.useCallback(
    (option: CompletionOption) => {
      const currentPlan = planRef.current;
      if (currentPlan === null) return;
      if (option.kind === "recent") {
        setDraftWithSelection(option.query, option.query.length);
        // A recent is a COMPLETE query the user explicitly picked, so it gets
        // the same Enter/blur reveal semantics: commit if valid, otherwise
        // reveal the red invalid state instead of silently no-op'ing (e.g. a
        // recent stored before a grammar tightening, or a since-retyped score).
        const state = storeApi.getState();
        if (state.draftValid) commitToFilterState();
        else state.actions.revealInvalid();
        setAppendIntent(false);
        setAutocompleteOpen(false);
        return;
      }

      const current = draftRef.current;
      let insert: string;
      let keepOpen: boolean;
      let replaceTo = currentPlan.to;
      if (option.kind === "field") {
        // Replacing the key of an existing filter: the span ends AT the colon,
        // so the insert must not bring its own.
        const colonFollows = current.slice(currentPlan.to).startsWith(":");
        insert = option.fieldId.endsWith(".")
          ? option.fieldId
          : colonFollows
            ? option.fieldId
            : `${option.fieldId}:`;
        keepOpen = true;
        // A dot-prefix field (`metadata.`/`scores.`/`traceScores.`) is itself a
        // partial key. When an existing `:value` follows the replaced key, the
        // bare prefix would splice in front of it (`meta:foo` -> broken
        // `metadata.:foo`). Consume the whole term so the user re-picks the key
        // from observed options instead.
        if (!appendIntent && option.fieldId.endsWith(".") && colonFollows) {
          replaceTo = termAt(current, currentPlan.from)?.to ?? currentPlan.to;
        }
        if (appendIntent && current.trimEnd().endsWith(insert)) {
          const caretAt = current.trimEnd().length;
          setDraftWithSelection(current, caretAt);
          setAppendIntent(false);
          setAutocompleteOpen(true);
          setHighlightedOptionId(null);
          return;
        }
      } else if (option.kind === "value") {
        insert = serializeValue(option.value);
        keepOpen = currentPlan.keepOpenOnPick ?? false;
      } else {
        insert = option.insert;
        // A trailing `:`, ` `, or `(` drops the caret into an interactive
        // context (value stage, next field, or an open array group like
        // `tags:(`) — keep the popover open so the next pick is immediate.
        keepOpen =
          option.insert.endsWith(":") ||
          option.insert.endsWith(" ") ||
          option.insert.endsWith("(");
      }

      // Picking a terminal value completes the filter: advance to "append
      // next" so the caret is ready for the next field (a fresh keystroke
      // starts a new token) and field suggestions reopen — instead of leaving
      // the caret inside the value where typing would edit what was just
      // picked. Grouped value entry (`field:(a OR …)`) stays put.
      const advanceAfterValue =
        option.kind === "value" && !(currentPlan.keepOpenOnPick ?? false);

      const prefix =
        appendIntent && current.trim().length > 0 && !/\s$/.test(current)
          ? " "
          : "";
      const next = appendIntent
        ? `${current}${prefix}${insert}`
        : replaceRange(current, currentPlan.from, replaceTo, insert);
      const caretAt = appendIntent
        ? current.length + prefix.length + insert.length
        : currentPlan.from + insert.length;
      setDraftWithSelection(next, caretAt);
      if (advanceAfterValue) {
        // Caret sits at the end of the just-completed token. appendIntent
        // makes the next insert start a new token; the selectionchange mirror
        // clears it automatically if the caret is not at the very end (e.g.
        // editing a value mid-query), so this only advances when appropriate.
        setAppendIntent(true);
        setAutocompleteOpen(true);
      } else {
        setAppendIntent(false);
        setAutocompleteOpen(keepOpen);
      }
      setHighlightedOptionId(null);
      // Apply when the pick produced a valid query; a partial draft (e.g. a
      // bare `level:` field pick) commits nothing and shows no error. A
      // dot-prefix field pick (`metadata.`, `scores.`, `traceScores.`) parses
      // as *valid free text*, so committing it would silently set searchQuery
      // to the bare prefix — defer until the user picks/types a key.
      if (!(option.kind === "field" && option.fieldId.endsWith("."))) {
        commitStructuredEdit();
      }
    },
    [
      appendIntent,
      draftRef,
      planRef,
      setDraftWithSelection,
      commitStructuredEdit,
      commitToFilterState,
      storeApi,
    ],
  );

  const removeSegment = React.useCallback(
    (segment: ComposerSegment) => {
      // removeChipSpan edits the draft; commit applies it when still valid.
      storeApi.getState().actions.removeChipSpan(segment.from, segment.to);
      commitStructuredEdit();
      setHoveredTokenId(null);
      setAppendIntent(false);
      setAutocompleteOpen(false);
      setHighlightedOptionId(null);
    },
    [storeApi, commitStructuredEdit],
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
      setAppendIntent(false);
      return;
    }

    // ArrowRight at the very end of the query "exits" the last token: enter
    // append mode (the next keystroke starts a NEW token instead of extending
    // the last pill) and open the field suggestions. Typing-induced caret
    // moves never reach here, so active value typing is unaffected.
    if (
      event.key === "ArrowRight" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      selectionCollapsed &&
      caret === draft.length &&
      draft.length > 0
    ) {
      // Keep the caret at the logical end rather than letting it drift across
      // the token's trailing zero-width WORD_JOINER — crossing it looks like a
      // dead first keypress ("ArrowRight only works the second time") and lands
      // the caret in the after-joiner spot that confuses backspace targeting.
      event.preventDefault();
      setAppendIntent(true);
      setAutocompleteOpen(true);
      setHighlightedOptionId(null);
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
      commit();
      return;
    }

    if (event.key === "Escape") {
      if (autocompleteOpen) {
        event.preventDefault();
        setAppendIntent(false);
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
      const next =
        idx === -1
          ? delta > 0
            ? 0
            : ids.length - 1
          : (idx + delta + ids.length) % ids.length;
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
    setAppendIntent(false);
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
    const append =
      draft.length > 0 && isPastTextEnd(root, event.clientX, event.clientY);
    if (append && end !== draft.length) {
      // The browser put the caret on the nearest character of a wrapped line;
      // a past-end click still means append at the very end.
      setSelectionRange(root, draft.length, draft.length);
      setSelectionSnapshot({ start: draft.length, end: draft.length });
    }
    if (!append && end < draft.length && /\s/.test(draft[end] ?? "")) {
      // Additive gap affordance: a click in the whitespace BETWEEN tokens
      // (geometrically past the previous token's right edge, not on the token
      // or its padding) nudges the collapsed caret across the whitespace run,
      // so typing starts the next entry instead of gluing to the previous
      // token. Clicks on token text keep their native caret untouched.
      const segment = deriveComposerSegments(draft, scoreTypes).find(
        (s) => s.to === end,
      );
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
    setAppendIntent(append);
    setAutocompleteOpen(true);
    setHighlightedOptionId(null);
  };

  const onRootMouseOver = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-overlay-remove]")) return; // keep the X alive under the pointer
    const token = target?.closest("[data-segment-id]");
    setHoveredTokenId(token?.getAttribute("data-segment-id") ?? null);
  };

  const describedBy =
    visibleDiagnostics.length > 0 ? "search-bar-diagnostics" : undefined;

  const segments = deriveComposerSegments(draft, scoreTypes);
  // The remove affordance targets the hovered token, or — while the editor is
  // focused — the token holding a collapsed caret. Not at the trailing
  // insertion point, where the user is appending, not editing.
  const focusTokenId =
    editorFocused && selectionCollapsed && caret < draft.length
      ? (segments.find((s) => s.editable && s.from <= caret && caret <= s.to)
          ?.id ?? null)
      : null;
  const removeTargetId = hoveredTokenId ?? focusTokenId;
  const removeTarget =
    segments.find((s) => s.editable && s.id === removeTargetId) ?? null;
  // The hovered/caret token's diagnostic, shown as a styled per-token tooltip
  // once diagnostics are revealed (Datadog-style) — replaces the native title.
  // Suppressed while the suggestions popover is open so the two overlays never
  // stack/collide (you're editing, not inspecting the error).
  const errorTarget =
    showTokenDiagnostics && plan === null && removeTarget?.kind === "invalid"
      ? removeTarget
      : null;

  // Measure the remove target's last client rect in the parent's layout
  // effect: it runs after every commit that can move text, and after all
  // subtree refs (root + container) are attached.
  const [removePosition, setRemovePosition] = React.useState<{
    left: number;
    top: number;
  } | null>(null);
  // Anchor for the per-token error tooltip — bottom-left of the same token, so
  // the styled diagnostic popover sits just under the offending block.
  const [errorPosition, setErrorPosition] = React.useState<{
    left: number;
    top: number;
  } | null>(null);
  const removeTargetIdActual = removeTarget?.id ?? null;
  const measureRemovePosition = React.useCallback(() => {
    const root = rootRef.current;
    const container = containerRef.current;
    if (root === null || container === null || removeTargetIdActual === null) {
      setRemovePosition(null);
      setErrorPosition(null);
      return;
    }
    const el = root.querySelector(
      `[data-segment-id="${CSS.escape(removeTargetIdActual)}"]`,
    );
    if (el === null) {
      setRemovePosition(null);
      setErrorPosition(null);
      return;
    }
    const rects = el.getClientRects();
    const rect =
      rects.length > 0 ? rects[rects.length - 1]! : el.getBoundingClientRect();
    const firstRect = rects.length > 0 ? rects[0]! : rect;
    const containerRect = container.getBoundingClientRect();
    setRemovePosition({
      left: rect.right - containerRect.left - 6,
      top: rect.top - containerRect.top - 8,
    });
    setErrorPosition({
      left: firstRect.left - containerRect.left,
      top: firstRect.bottom - containerRect.top + 6,
    });
  }, [removeTargetIdActual]);

  // Re-measure when the target or draft text changes.
  React.useLayoutEffect(() => {
    measureRemovePosition();
  }, [measureRemovePosition, draft]);

  // Those deps miss layout reflows that don't change React state — window
  // resize, browser zoom, sidebar collapse — which re-wrap the full-width bar
  // and move the token. Observe the composer surface so the absolutely-
  // positioned X re-anchors to its token instead of leaving a stale ghost X.
  React.useEffect(() => {
    if (removeTargetIdActual === null) return;
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureRemovePosition());
    observer.observe(container);
    return () => observer.disconnect();
  }, [measureRemovePosition, removeTargetIdActual]);

  return (
    <div
      ref={containerRef}
      data-testid="search-bar"
      role="search"
      className="relative w-full"
    >
      <div
        data-testid="search-bar-surface"
        data-composer-text={draft}
        onMouseLeave={() => setHoveredTokenId(null)}
        className={cn(
          // Prominent primary control. Block (not flex) so inline pills never
          // break across a wrap. Balanced padding: a small, even gutter on all
          // sides (the left no longer dwarfs the inter-pill gap and top), py
          // centers a single line near min-h-9 and the box grows when wrapped.
          // pr-8 keeps the top-right error icon clear of the last token.
          "border-input bg-background relative min-h-9 rounded-md border px-2 py-1.5 pr-8",
          "focus-within:ring-ring focus-within:ring-1",
          showGlobalDiagnostics &&
            "border-destructive focus-within:ring-destructive/40",
        )}
      >
        {draft.length === 0 && (
          <div className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 truncate pr-8 font-mono text-xs">
            {COMPOSER_PLACEHOLDER}
          </div>
        )}
        <div
          ref={rootRef}
          role="combobox"
          aria-label="Search"
          aria-expanded={plan !== null}
          aria-controls={plan !== null ? LISTBOX_ID : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            plan !== null && highlightedId !== null
              ? optionDomId(LISTBOX_ID, highlightedId)
              : undefined
          }
          aria-describedby={describedBy}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          data-testid="search-bar-input"
          className="min-h-6 font-mono text-xs leading-7 break-words whitespace-pre-wrap caret-[hsl(var(--foreground))] outline-none"
          onInput={(event) => {
            if (!(event.nativeEvent as InputEvent).isComposing) syncFromDom();
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
          <ComposerTokens
            draft={draft}
            showDiagnostics={showTokenDiagnostics}
            scoreTypes={scoreTypes}
          />
        </div>
        {/* Bar-local overlay stacking ladder (hardcoded for now — a proper
            app-wide layer system is a separate ticket): token text (base) <
            remove-X (z-20) < error tooltip (z-30) < autocomplete popover
            (z-50). The error tooltip and the popover are also mutually
            exclusive (see errorTarget), so the z order only needs to be
            self-consistent within the bar. */}
        {removeTarget !== null && removePosition !== null && (
          <RemoveTokenButton
            segment={removeTarget}
            position={removePosition}
            onRemove={removeSegment}
          />
        )}
        {errorTarget !== null && errorPosition !== null && (
          <div
            role="tooltip"
            style={{ left: errorPosition.left, top: errorPosition.top }}
            // pointer-events-none so moving onto the tooltip doesn't change the
            // hovered token (which would make it flicker away).
            className={cn(
              "pointer-events-none absolute z-30 max-w-[min(360px,calc(100vw-32px))]",
              "border-destructive/40 bg-popover text-destructive rounded-md border",
              "px-2 py-1 font-sans text-xs leading-snug shadow-md",
            )}
          >
            {errorTarget.message}
          </div>
        )}
      </div>

      {showGlobalDiagnostics && (
        <div className="absolute top-1.5 right-2 flex items-center gap-1">
          <span
            className="text-destructive"
            title={visibleDiagnostics.map((d) => d.message).join("; ")}
            aria-label="invalid query"
          >
            <AlertCircle className="h-4 w-4" />
          </span>
        </div>
      )}

      {visibleDiagnostics.length > 0 && (
        <div id="search-bar-diagnostics" className="sr-only">
          {visibleDiagnostics.map((d) => d.message).join("; ")}
        </div>
      )}

      {plan !== null && (
        <AutocompletePopover
          plan={plan}
          highlightedId={highlightedId}
          onPick={pickOption}
          onHighlight={setHighlightedOptionId}
          listboxId={LISTBOX_ID}
          anchorLeft={0}
          containerRef={containerRef}
        />
      )}
    </div>
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
  segment: ComposerSegment;
  position: { left: number; top: number };
  onRemove: (segment: ComposerSegment) => void;
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
      <X className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}
