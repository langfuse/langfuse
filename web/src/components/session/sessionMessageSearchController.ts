"use client";

// Page-scoped search controller shared by the compact session feed and toolbar.

import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { deepParseJson } from "@langfuse/shared";
import isEqual from "lodash/isEqual";

import { type SessionTraceObservation } from "./SessionObservationIO";
import { type IOPreviewContentMode } from "@/src/components/trace/components/IOPreview/IOPreview";
import {
  hasRenderableConversationMessages,
  isOnlyJsonMessage,
  shouldRenderMessageForContentMode,
} from "@/src/components/trace/components/IOPreview/components/chat-message-utils";
import { parseChatML } from "@/src/components/trace/components/IOPreview/hooks/useChatMLParser";

export const SESSION_OBSERVATIONS_PER_TRACE_LIMIT = 50;
export const SESSION_SEARCH_PREVIEW_DISPLAY_CHARS = 4_000;
const SEARCH_INPUT_DEBOUNCE_MS = 150;
const MATCH_HIGHLIGHT_NAME = "session-message-search-match";
const ACTIVE_MATCH_HIGHLIGHT_NAME = "session-message-search-active";

const hasContent = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.trim() === "");

const observationHasIO = (observation: {
  input?: unknown;
  output?: unknown;
}): boolean => hasContent(observation.input) || hasContent(observation.output);

export function selectVisibleSessionObservations<
  TObservation extends {
    id: string;
    input?: unknown;
    output?: unknown;
    inputLength: number;
    outputLength: number;
  },
>({
  traceId,
  observations,
}: {
  traceId: string;
  observations: TObservation[];
}) {
  const syntheticTraceRowId = `t-${traceId}`;
  let realCount = 0;
  let realShown = 0;
  const page: TObservation[] = [];

  // The server returns one real row past the display limit as the "more"
  // sentinel. The synthetic trace row never consumes a real-observation slot.
  for (const observation of observations) {
    if (observation.id === syntheticTraceRowId) {
      page.push(observation);
      continue;
    }
    realCount++;
    if (realShown >= SESSION_OBSERVATIONS_PER_TRACE_LIMIT) continue;
    page.push(observation);
    realShown++;
  }

  const syntheticRow = page.find(
    (observation) => observation.id === syntheticTraceRowId,
  );
  const realObservations = page.filter(
    (observation) => observation.id !== syntheticTraceRowId,
  );
  // Equal preview heads only prove duplicate I/O when their full lengths also
  // match; otherwise two server-truncated payloads can share the same prefix.
  const syntheticRowIsRedundant =
    !syntheticRow ||
    !observationHasIO(syntheticRow) ||
    realObservations.some(
      (observation) =>
        (hasContent(syntheticRow.input) &&
          isEqual(observation.input, syntheticRow.input) &&
          observation.inputLength === syntheticRow.inputLength) ||
        (hasContent(syntheticRow.output) &&
          isEqual(observation.output, syntheticRow.output) &&
          observation.outputLength === syntheticRow.outputLength),
    );

  return {
    visibleObservations: !syntheticRowIsRedundant
      ? page
      : realObservations.length > 0
        ? realObservations
        : page,
    hasMoreObservations: realCount > SESSION_OBSERVATIONS_PER_TRACE_LIMIT,
  };
}

export type SessionSearchDocument = {
  id: string;
  targetId: string;
  traceId: string;
  traceIndex: number;
  observationId: string;
  field: "input" | "output";
  label: "Input" | "Output";
  text: string;
};

export type SessionSearchMatch = SessionSearchDocument & {
  key: string;
  from: number;
  to: number;
  targetMatchIndex: number;
};

export type SessionSearchLoadProgress = {
  completedTraceCount: number;
  totalTraceCount: number;
};

export type SessionSearchLoadResult = {
  documents: SessionSearchDocument[];
  failedTraceCount: number;
};

export type SessionSearchDocumentLoader = (options: {
  signal: AbortSignal;
  onProgress: (progress: SessionSearchLoadProgress) => void;
}) => Promise<SessionSearchLoadResult>;

export type SessionMessageSearchSnapshot = {
  isOpen: boolean;
  openRequestCount: number;
  queryInput: string;
  query: string;
  matches: SessionSearchMatch[];
  activeMatch: SessionSearchMatch | null;
  activeMatchIndex: number;
  isLoading: boolean;
  completedTraceCount: number;
  totalTraceCount: number;
  failedTraceCount: number;
  loadFailed: boolean;
};

type SessionSearchTarget = {
  root: HTMLElement;
  observer: MutationObserver | null;
  ranges: Range[];
};

export type SessionMessageSearchController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SessionMessageSearchSnapshot;
  dispose: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setQueryInput: (value: string) => void;
  blurQueryInput: () => void;
  nextMatch: () => void;
  previousMatch: () => void;
  setScope: (scope: string) => void;
  setTraceNavigator: (
    navigateToTrace: ((traceIndex: number) => void) | null,
  ) => void;
  registerTarget: (targetId: string, root: HTMLElement) => void;
  unregisterTarget: (targetId: string) => void;
};

function formatSearchValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

function getConversationMessageSearchText(message: {
  content?: unknown;
  thinking?: Array<{ content?: unknown; summary?: unknown }>;
  redacted_thinking?: Array<{ data?: unknown }>;
  audio?: unknown;
}) {
  return [
    formatSearchValue(message.content),
    ...(message.thinking ?? []).flatMap((thinking) => [
      formatSearchValue(thinking.content),
      formatSearchValue(thinking.summary),
    ]),
    ...(message.redacted_thinking ?? []).map((thinking) =>
      formatSearchValue(thinking.data),
    ),
    formatSearchValue(message.audio),
  ]
    .filter(Boolean)
    .join("\n");
}

function getParsedObservation(observation: SessionTraceObservation) {
  return {
    input: deepParseJson(observation.input, {
      maxSize: 300_000,
      maxDepth: 2,
    }),
    output: deepParseJson(observation.output, {
      maxSize: 300_000,
      maxDepth: 2,
    }),
    metadata: deepParseJson(observation.metadata, {
      maxSize: 100_000,
      maxDepth: 2,
    }),
  };
}

export function isModernSessionConversation({
  parserResult,
  contentMode,
  showSystemPrompt,
}: {
  parserResult: ReturnType<typeof parseChatML>;
  contentMode: IOPreviewContentMode;
  showSystemPrompt?: boolean;
}) {
  return (
    parserResult.canDisplayAsChat &&
    (contentMode === "conversation"
      ? hasRenderableConversationMessages(
          parserResult.allMessages,
          showSystemPrompt,
        )
      : !parserResult.allMessages.every(isOnlyJsonMessage))
  );
}

export function buildSessionSearchDocuments({
  traceId,
  traceIndex,
  observations,
  contentMode,
  showSystemPrompt,
}: {
  traceId: string;
  traceIndex: number;
  observations: SessionTraceObservation[];
  contentMode: IOPreviewContentMode;
  showSystemPrompt?: boolean;
}): SessionSearchDocument[] {
  const { visibleObservations } = selectVisibleSessionObservations({
    traceId,
    observations,
  });
  const documents: SessionSearchDocument[] = [];

  const addDocument = (
    observation: SessionTraceObservation,
    field: "input" | "output",
    text: string,
    segmentId?: string,
  ) => {
    if (!text) return;
    documents.push({
      id: `${traceId}:${observation.id}:${field}${segmentId ? `:${segmentId}` : ""}`,
      targetId: `${traceId}:${observation.id}`,
      traceId,
      traceIndex,
      observationId: observation.id,
      field,
      label: field === "input" ? "Input" : "Output",
      text,
    });
  };

  for (const observation of visibleObservations) {
    const isTruncated = Boolean(
      observation.inputTruncated || observation.outputTruncated,
    );

    if (isTruncated) {
      addDocument(
        observation,
        "input",
        formatSearchValue(observation.input).slice(
          0,
          SESSION_SEARCH_PREVIEW_DISPLAY_CHARS,
        ),
      );
      addDocument(
        observation,
        "output",
        formatSearchValue(observation.output).slice(
          0,
          SESSION_SEARCH_PREVIEW_DISPLAY_CHARS,
        ),
      );
      continue;
    }

    const parsed = getParsedObservation(observation);
    const parserResult = parseChatML(
      parsed.input,
      parsed.output,
      parsed.metadata,
      observation.name ?? undefined,
    );
    const isConversation = isModernSessionConversation({
      parserResult,
      contentMode,
      showSystemPrompt,
    });

    if (isConversation && contentMode === "conversation") {
      for (const [
        messageIndex,
        message,
      ] of parserResult.allMessages.entries()) {
        if (
          !shouldRenderMessageForContentMode(
            message,
            contentMode,
            showSystemPrompt,
          )
        ) {
          continue;
        }

        addDocument(
          observation,
          messageIndex < parserResult.inputMessageCount ? "input" : "output",
          getConversationMessageSearchText(message),
          `message-${messageIndex}`,
        );
      }
      continue;
    }

    addDocument(observation, "input", formatSearchValue(parsed.input));
    addDocument(observation, "output", formatSearchValue(parsed.output));
  }

  return documents;
}

function buildMatches(
  documents: SessionSearchDocument[],
  query: string,
): SessionSearchMatch[] {
  if (!query) return [];

  const searchQuery = new SearchQuery({
    search: query,
    caseSensitive: false,
    literal: true,
  });
  const matches: SessionSearchMatch[] = [];
  const matchCountByTarget = new Map<string, number>();

  for (const document of documents) {
    const cursor = searchQuery.getCursor(
      EditorState.create({ doc: document.text }),
    );
    let match = cursor.next();

    while (!match.done) {
      const targetMatchIndex = matchCountByTarget.get(document.targetId) ?? 0;
      const { from, to } = match.value;
      matches.push({
        ...document,
        key: `${document.id}:${from}:${to}`,
        from,
        to,
        targetMatchIndex,
      });
      matchCountByTarget.set(document.targetId, targetMatchIndex + 1);
      match = cursor.next();
    }
  }

  return matches;
}

function getTextSearchRanges(root: HTMLElement, query: string): Range[] {
  if (!query || typeof document === "undefined") return [];

  const visibilityCache = new WeakMap<Element, boolean>();
  const isVisible = (element: Element) => {
    const cached = visibilityCache.get(element);
    if (cached !== undefined) return cached;

    let current: Element | null = element;
    while (current && root.contains(current)) {
      if (
        current.hasAttribute("hidden") ||
        current.getAttribute("aria-hidden") === "true"
      ) {
        visibilityCache.set(element, false);
        return false;
      }
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") {
        visibilityCache.set(element, false);
        return false;
      }
      if (current === root) break;
      current = current.parentElement;
    }

    visibilityCache.set(element, true);
    return true;
  };

  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        !parent ||
        !node.textContent ||
        parent.closest(
          "button, input, textarea, select, script, style, [data-session-search-ignore]",
        ) ||
        !isVisible(parent)
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let text = "";
  let current = walker.nextNode();

  while (current) {
    const value = current.textContent ?? "";
    const start = text.length;
    text += value;
    nodes.push({ node: current as Text, start, end: start + value.length });
    current = walker.nextNode();
  }

  if (!text) return [];

  const searchQuery = new SearchQuery({
    search: query,
    caseSensitive: false,
    literal: true,
  });
  const cursor = searchQuery.getCursor(EditorState.create({ doc: text }));
  const ranges: Range[] = [];
  let match = cursor.next();

  while (!match.done) {
    const { from, to } = match.value;
    const startNode = nodes.find(
      (entry) => from >= entry.start && from < entry.end,
    );
    const endNode = [...nodes]
      .reverse()
      .find((entry) => to > entry.start && to <= entry.end);

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode.node, from - startNode.start);
      range.setEnd(endNode.node, to - endNode.start);
      ranges.push(range);
    }

    match = cursor.next();
  }

  return ranges;
}

type HighlightRegistryLike = {
  set: (name: string, highlight: object) => void;
  delete: (name: string) => void;
};

type HighlightConstructor = new (...ranges: Range[]) => object;

function getHighlightApi() {
  if (typeof CSS === "undefined") return null;
  const registry = (CSS as typeof CSS & { highlights?: HighlightRegistryLike })
    .highlights;
  const Constructor = (
    globalThis as typeof globalThis & { Highlight?: HighlightConstructor }
  ).Highlight;

  return registry && Constructor ? { registry, Constructor } : null;
}

export function createSessionMessageSearchController({
  loadDocuments,
}: {
  loadDocuments: SessionSearchDocumentLoader;
}): SessionMessageSearchController {
  const state = {
    isOpen: false,
    openRequestCount: 0,
    queryInput: "",
    query: "",
    matches: [] as SessionSearchMatch[],
    activeMatchKey: null as string | null,
    documents: null as SessionSearchDocument[] | null,
    isLoading: false,
    completedTraceCount: 0,
    totalTraceCount: 0,
    failedTraceCount: 0,
    loadFailed: false,
    scope: "",
  };
  const listeners = new Set<() => void>();
  const targets = new Map<string, SessionSearchTarget>();
  const dirtyTargetIds = new Set<string>();
  let pendingQueryTimeout: number | null = null;
  let pendingTargetFrameId: number | null = null;
  let loadGeneration = 0;
  let loadAbortController: AbortController | null = null;
  let navigateToTrace: ((traceIndex: number) => void) | null = null;
  let cachedSnapshot: SessionMessageSearchSnapshot;

  const getActiveMatchIndex = () =>
    state.activeMatchKey
      ? state.matches.findIndex((match) => match.key === state.activeMatchKey)
      : -1;
  const getActiveMatch = () => {
    const index = getActiveMatchIndex();
    return index >= 0 ? (state.matches[index] ?? null) : null;
  };
  const refreshSnapshot = () => {
    cachedSnapshot = {
      isOpen: state.isOpen,
      openRequestCount: state.openRequestCount,
      queryInput: state.queryInput,
      query: state.query,
      matches: state.matches,
      activeMatch: getActiveMatch(),
      activeMatchIndex: getActiveMatchIndex(),
      isLoading: state.isLoading,
      completedTraceCount: state.completedTraceCount,
      totalTraceCount: state.totalTraceCount,
      failedTraceCount: state.failedTraceCount,
      loadFailed: state.loadFailed,
    };
  };
  const emit = () => {
    refreshSnapshot();
    listeners.forEach((listener) => listener());
  };
  const clearPendingQueryTimeout = () => {
    if (pendingQueryTimeout === null) return;
    window.clearTimeout(pendingQueryTimeout);
    pendingQueryTimeout = null;
  };
  const rebuildHighlightRegistry = () => {
    const api = getHighlightApi();
    if (!api) return;

    const ranges = [...targets.values()].flatMap((target) => target.ranges);
    if (ranges.length > 0) {
      api.registry.set(MATCH_HIGHLIGHT_NAME, new api.Constructor(...ranges));
    } else {
      api.registry.delete(MATCH_HIGHLIGHT_NAME);
    }

    const activeMatch = getActiveMatch();
    const activeRange = activeMatch
      ? targets.get(activeMatch.targetId)?.ranges[activeMatch.targetMatchIndex]
      : undefined;
    if (activeRange) {
      api.registry.set(
        ACTIVE_MATCH_HIGHLIGHT_NAME,
        new api.Constructor(activeRange),
      );
    } else {
      api.registry.delete(ACTIVE_MATCH_HIGHLIGHT_NAME);
    }
  };
  const refreshTarget = (targetId: string) => {
    const target = targets.get(targetId);
    if (!target) return;
    target.ranges = getTextSearchRanges(target.root, state.query);
  };
  const scheduleTargetRefresh = (targetId: string) => {
    dirtyTargetIds.add(targetId);
    if (pendingTargetFrameId !== null) return;

    pendingTargetFrameId = requestAnimationFrame(() => {
      pendingTargetFrameId = null;
      const activeTargetId = getActiveMatch()?.targetId;
      const activeTargetWasRefreshed =
        activeTargetId !== undefined && dirtyTargetIds.has(activeTargetId);
      dirtyTargetIds.forEach(refreshTarget);
      dirtyTargetIds.clear();
      rebuildHighlightRegistry();
      if (activeTargetWasRefreshed) scrollToActiveRange();
    });
  };
  const scrollToActiveRange = () => {
    const activeMatch = getActiveMatch();
    if (!activeMatch) return;
    const range = targets.get(activeMatch.targetId)?.ranges[
      activeMatch.targetMatchIndex
    ];
    const element =
      range?.startContainer.parentElement ??
      (range?.startContainer instanceof HTMLElement
        ? range.startContainer
        : null);
    element?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  };
  const syncActiveMatch = () => {
    const activeMatch = getActiveMatch();
    if (!activeMatch) {
      rebuildHighlightRegistry();
      return;
    }
    navigateToTrace?.(activeMatch.traceIndex);
    rebuildHighlightRegistry();
    scrollToActiveRange();
  };
  const recomputeMatches = () => {
    const previousKey = state.activeMatchKey;
    state.matches = state.documents
      ? buildMatches(state.documents, state.query)
      : [];
    if (state.matches.length === 0) {
      state.activeMatchKey = null;
    } else if (
      !previousKey ||
      !state.matches.some((match) => match.key === previousKey)
    ) {
      state.activeMatchKey = state.matches[0]?.key ?? null;
    }
    targets.forEach((target) => {
      target.ranges = getTextSearchRanges(target.root, state.query);
    });
    syncActiveMatch();
  };
  const startLoading = () => {
    if (state.documents || state.isLoading || !state.query) return;
    const generation = ++loadGeneration;
    loadAbortController?.abort();
    loadAbortController = new AbortController();
    state.isLoading = true;
    state.loadFailed = false;
    state.completedTraceCount = 0;
    state.totalTraceCount = 0;
    emit();

    loadDocuments({
      signal: loadAbortController.signal,
      onProgress(progress) {
        if (generation !== loadGeneration) return;
        state.completedTraceCount = progress.completedTraceCount;
        state.totalTraceCount = progress.totalTraceCount;
        emit();
      },
    }).then(
      (result) => {
        if (generation !== loadGeneration) return;
        state.documents = result.documents;
        state.failedTraceCount = result.failedTraceCount;
        state.isLoading = false;
        recomputeMatches();
        emit();
      },
      () => {
        if (generation !== loadGeneration) return;
        state.documents = [];
        state.isLoading = false;
        state.loadFailed = true;
        recomputeMatches();
        emit();
      },
    );
  };
  const commitQuery = (query: string) => {
    if (state.query === query) return;
    state.query = query;
    recomputeMatches();
    if (query) startLoading();
  };
  const flushPendingQuery = () => {
    if (pendingQueryTimeout === null) return;
    clearPendingQueryTimeout();
    commitQuery(state.queryInput);
  };
  const moveActiveMatch = (direction: 1 | -1) => {
    flushPendingQuery();
    if (state.matches.length === 0) return;
    const currentIndex = getActiveMatchIndex();
    const fallback = direction > 0 ? 0 : state.matches.length - 1;
    const nextIndex =
      currentIndex < 0
        ? fallback
        : (currentIndex + direction + state.matches.length) %
          state.matches.length;
    state.activeMatchKey = state.matches[nextIndex]?.key ?? null;
    syncActiveMatch();
    emit();
  };

  refreshSnapshot();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return cachedSnapshot;
    },
    dispose() {
      clearPendingQueryTimeout();
      loadAbortController?.abort();
      loadGeneration++;
      targets.forEach((target) => target.observer?.disconnect());
      if (pendingTargetFrameId !== null)
        cancelAnimationFrame(pendingTargetFrameId);
      dirtyTargetIds.clear();
      targets.clear();
      const api = getHighlightApi();
      api?.registry.delete(MATCH_HIGHLIGHT_NAME);
      api?.registry.delete(ACTIVE_MATCH_HIGHLIGHT_NAME);
      listeners.clear();
    },
    openSearch() {
      state.isOpen = true;
      state.openRequestCount++;
      emit();
    },
    closeSearch() {
      clearPendingQueryTimeout();
      state.isOpen = false;
      state.queryInput = "";
      state.query = "";
      state.matches = [];
      state.activeMatchKey = null;
      targets.forEach((target) => {
        target.ranges = [];
      });
      rebuildHighlightRegistry();
      emit();
    },
    setQueryInput(value) {
      if (state.queryInput === value) return;
      state.queryInput = value;
      clearPendingQueryTimeout();
      if (value === "") {
        commitQuery("");
        emit();
        return;
      }
      emit();
      if (value === state.query) return;
      pendingQueryTimeout = window.setTimeout(() => {
        pendingQueryTimeout = null;
        commitQuery(value);
        emit();
      }, SEARCH_INPUT_DEBOUNCE_MS);
    },
    blurQueryInput() {
      if (state.queryInput.trim() !== "") return;
      clearPendingQueryTimeout();
      state.queryInput = "";
      commitQuery("");
      emit();
    },
    nextMatch() {
      moveActiveMatch(1);
    },
    previousMatch() {
      moveActiveMatch(-1);
    },
    setScope(scope) {
      if (state.scope === scope) return;
      state.scope = scope;
      loadAbortController?.abort();
      loadGeneration++;
      state.documents = null;
      state.isLoading = false;
      state.failedTraceCount = 0;
      state.loadFailed = false;
      recomputeMatches();
      if (state.query) startLoading();
      emit();
    },
    setTraceNavigator(nextNavigateToTrace) {
      navigateToTrace = nextNavigateToTrace;
    },
    registerTarget(targetId, root) {
      const existing = targets.get(targetId);
      existing?.observer?.disconnect();

      const target: SessionSearchTarget = {
        root,
        observer: null,
        ranges: [],
      };
      target.observer =
        typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(() => scheduleTargetRefresh(targetId));
      target.observer?.observe(root, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
        attributeFilter: ["class", "hidden", "style"],
      });
      targets.set(targetId, target);
      scheduleTargetRefresh(targetId);
    },
    unregisterTarget(targetId) {
      const target = targets.get(targetId);
      target?.observer?.disconnect();
      dirtyTargetIds.delete(targetId);
      targets.delete(targetId);
      rebuildHighlightRegistry();
    },
  };
}
