"use client";

// Page-scoped search controller shared by the compact session feed and toolbar.

import { Text as CodeMirrorText } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { deepParseJson } from "@langfuse/shared";
import isEqual from "lodash/isEqual";

import { type SessionTraceObservation } from "./SessionObservationIO";
import { type IOPreviewContentMode } from "@/src/components/trace/components/IOPreview/IOPreview";
import {
  type ChatMlMessage,
  hasAdditionalData,
  hasRenderableContent,
  hasRenderableConversationMessages,
  isOnlyJsonMessage,
  isPlaceholderMessage,
  shouldRenderMessageForContentMode,
} from "@/src/components/trace/components/IOPreview/components/chat-message-utils";
import { parseChatML } from "@/src/components/trace/components/IOPreview/hooks/useChatMLParser";

export const SESSION_OBSERVATIONS_PER_TRACE_LIMIT = 50;
export const SESSION_SEARCH_PREVIEW_DISPLAY_CHARS = 4_000;
const SEARCH_INPUT_DEBOUNCE_MS = 150;
const MATCH_HIGHLIGHT_NAME = "session-message-search-match";
const ACTIVE_MATCH_HIGHLIGHT_NAME = "session-message-search-active";
const HIDDEN_MATCH_ATTRIBUTE = "data-session-search-hidden-match";

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
  field: "input" | "output" | "metadata";
  label: "Input" | "Output" | "Metadata";
  text: string;
};

export type SessionSearchMatch = SessionSearchDocument & {
  key: string;
  from: number;
  to: number;
  targetMatchIndex: number;
};

export type SessionSearchRemoteResult = {
  key: string;
  traceId: string;
  traceIndex: number;
  observationId: string;
  observationName: string | null;
  traceName: string | null;
  startTime: Date;
};

export type SessionSearchRemoteLoadResult = {
  results: SessionSearchRemoteResult[];
  hasMore: boolean;
};

type SessionSearchRemotePageResult = Omit<
  SessionSearchRemoteResult,
  "key" | "traceIndex"
>;

export async function loadSessionSearchRemoteResults({
  limit,
  localObservationIds,
  traceIndexById,
  loadPage,
}: {
  limit: number;
  localObservationIds: ReadonlySet<string>;
  traceIndexById: ReadonlyMap<string, number>;
  loadPage: (pagination: { limit: number; offset: number }) => Promise<{
    results: SessionSearchRemotePageResult[];
    hasMore: boolean;
  }>;
}): Promise<SessionSearchRemoteLoadResult> {
  const results: SessionSearchRemoteResult[] = [];
  const resultKeys = new Set<string>();
  let offset = 0;
  let hasMore = true;

  while (hasMore && results.length <= limit) {
    const page = await loadPage({ limit, offset });
    offset += page.results.length;
    hasMore = page.hasMore;

    for (const result of page.results) {
      if (localObservationIds.has(result.observationId)) continue;
      const traceIndex = traceIndexById.get(result.traceId);
      if (traceIndex === undefined) continue;
      const key = `${result.traceId}:${result.observationId}`;
      if (resultKeys.has(key)) continue;
      resultKeys.add(key);
      results.push({ ...result, key, traceIndex });
    }

    if (page.results.length === 0) {
      hasMore = false;
    }
  }

  return {
    results: results.slice(0, limit),
    hasMore: results.length > limit || hasMore,
  };
}

export type SessionMessageSearchSnapshot = {
  isOpen: boolean;
  openRequestCount: number;
  queryInput: string;
  query: string;
  matches: SessionSearchMatch[];
  activeMatch: SessionSearchMatch | null;
  activeMatchIndex: number;
  isRemoteLoading: boolean;
  remoteResults: SessionSearchRemoteResult[];
  remoteHasMore: boolean;
  remoteLoadFailed: boolean;
};

export type SessionMessageSearchTargetSnapshot = {
  query: string;
  activeMatchIndex: number;
};

type SessionSearchTarget = {
  root: HTMLElement;
  observer: MutationObserver | null;
  ranges: Range[];
  textSnapshot: SessionSearchTextSnapshot | null;
};

type SessionSearchTextNode = {
  node: Text;
  start: number;
  end: number;
};

type SessionSearchTextSnapshot = {
  text: string;
  nodes: SessionSearchTextNode[];
};

export type SessionMessageSearchController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SessionMessageSearchSnapshot;
  getTargetSnapshot: (targetId: string) => SessionMessageSearchTargetSnapshot;
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
  setRemoteNavigator: (
    navigateToResult: ((result: SessionSearchRemoteResult) => void) | null,
  ) => void;
  openRemoteResult: (result: SessionSearchRemoteResult) => void;
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

function getFormattedMessageSearchText(
  message: ChatMlMessage,
  contentMode: IOPreviewContentMode,
) {
  const parts = [
    formatSearchValue(message.content),
    formatSearchValue(message.audio),
  ];

  if (contentMode === "conversation") {
    return parts.filter(Boolean).join("\n");
  }

  if (isOnlyJsonMessage(message)) {
    parts.push(formatSearchValue(message.json));
  } else if (isPlaceholderMessage(message)) {
    parts.push(formatSearchValue(message.name));
  } else {
    if (message.tool_calls?.length) {
      parts.push(formatSearchValue(message.tool_calls));
    }

    if (
      !hasRenderableContent(message) &&
      !message.tool_calls?.length &&
      hasAdditionalData(message)
    ) {
      const {
        thinking: _thinking,
        redacted_thinking: _redactedThinking,
        tools: _tools,
        ...visibleMessage
      } = message;
      parts.push(formatSearchValue(visibleMessage));
    }
  }

  return parts.filter(Boolean).join("\n");
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
  includeMetadata = false,
}: {
  traceId: string;
  traceIndex: number;
  observations: SessionTraceObservation[];
  contentMode: IOPreviewContentMode;
  showSystemPrompt?: boolean;
  includeMetadata?: boolean;
}): SessionSearchDocument[] {
  const { visibleObservations } = selectVisibleSessionObservations({
    traceId,
    observations,
  });
  const documents: SessionSearchDocument[] = [];

  const addDocument = (
    observation: SessionTraceObservation,
    field: "input" | "output" | "metadata",
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
      label:
        field === "input"
          ? "Input"
          : field === "output"
            ? "Output"
            : "Metadata",
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
      if (includeMetadata) {
        addDocument(
          observation,
          "metadata",
          formatSearchValue(observation.metadata).slice(
            0,
            SESSION_SEARCH_PREVIEW_DISPLAY_CHARS,
          ),
        );
      }
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

    if (isConversation) {
      if (contentMode === "all" && parserResult.allTools.length > 0) {
        addDocument(
          observation,
          "input",
          formatSearchValue(parserResult.allTools),
          "tools",
        );
      }

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
          getFormattedMessageSearchText(message, contentMode),
          `message-${messageIndex}`,
        );
      }

      if (contentMode === "all") {
        addDocument(
          observation,
          "input",
          formatSearchValue(parserResult.additionalInput),
          "additional-input",
        );
      }

      continue;
    }

    addDocument(observation, "input", formatSearchValue(parsed.input));
    addDocument(observation, "output", formatSearchValue(parsed.output));
    if (includeMetadata) {
      addDocument(observation, "metadata", formatSearchValue(parsed.metadata));
    }
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
      CodeMirrorText.of(document.text.split("\n")),
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

function getTextSearchSnapshot(root: HTMLElement): SessionSearchTextSnapshot {
  const visibilityCache = new WeakMap<Element, boolean>();
  const isVisible = (element: Element): boolean => {
    const cached = visibilityCache.get(element);
    if (cached !== undefined) return cached;

    if (
      element.hasAttribute("hidden") ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      visibilityCache.set(element, false);
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      visibilityCache.set(element, false);
      return false;
    }

    const parent = element.parentElement;
    const visible =
      element === root ||
      !parent ||
      !root.contains(parent) ||
      isVisible(parent);
    visibilityCache.set(element, visible);
    return visible;
  };

  const nodes: SessionSearchTextNode[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        !parent ||
        !node.textContent ||
        parent.closest(
          "button, input, textarea, select, script, style, .io-message-header, [data-session-search-ignore]",
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

  return { text, nodes };
}

function getTextSearchRanges(
  snapshot: SessionSearchTextSnapshot,
  query: string,
): Range[] {
  if (!query || !snapshot.text || typeof document === "undefined") return [];

  const searchQuery = new SearchQuery({
    search: query,
    caseSensitive: false,
    literal: true,
  });
  const cursor = searchQuery.getCursor(
    CodeMirrorText.of(snapshot.text.split("\n")),
  );
  const ranges: Range[] = [];
  let match = cursor.next();
  let startNodeIndex = 0;
  let endNodeIndex = 0;

  while (!match.done) {
    const { from, to } = match.value;
    while (
      startNodeIndex < snapshot.nodes.length &&
      from >= (snapshot.nodes[startNodeIndex]?.end ?? 0)
    ) {
      startNodeIndex++;
    }
    endNodeIndex = Math.max(endNodeIndex, startNodeIndex);
    while (
      endNodeIndex < snapshot.nodes.length &&
      to > (snapshot.nodes[endNodeIndex]?.end ?? 0)
    ) {
      endNodeIndex++;
    }
    const startNode = snapshot.nodes[startNodeIndex];
    const endNode = snapshot.nodes[endNodeIndex];

    if (startNode && endNode && from >= startNode.start && to > endNode.start) {
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
  getLocalDocuments,
  searchRemote,
}: {
  getLocalDocuments: () => SessionSearchDocument[];
  searchRemote: (
    query: string,
    localObservationIds: ReadonlySet<string>,
  ) => Promise<SessionSearchRemoteLoadResult>;
}): SessionMessageSearchController {
  const state = {
    isOpen: false,
    openRequestCount: 0,
    queryInput: "",
    query: "",
    matches: [] as SessionSearchMatch[],
    activeMatchKey: null as string | null,
    documents: [] as SessionSearchDocument[],
    isRemoteLoading: false,
    remoteResults: [] as SessionSearchRemoteResult[],
    remoteHasMore: false,
    remoteLoadFailed: false,
    scope: "",
    documentsDirty: true,
  };
  const listeners = new Set<() => void>();
  const targets = new Map<string, SessionSearchTarget>();
  const dirtyTargetIds = new Set<string>();
  const targetSnapshots = new Map<string, SessionMessageSearchTargetSnapshot>();
  let pendingRemoteTimeout: number | null = null;
  let pendingTargetFrameId: number | null = null;
  let remoteGeneration = 0;
  let navigateToTrace: ((traceIndex: number) => void) | null = null;
  let navigateToRemoteResult:
    | ((result: SessionSearchRemoteResult) => void)
    | null = null;
  let cachedSnapshot: SessionMessageSearchSnapshot;

  const getActiveMatchIndex = () =>
    state.activeMatchKey
      ? state.matches.findIndex((match) => match.key === state.activeMatchKey)
      : -1;
  const getActiveMatch = () => {
    const index = getActiveMatchIndex();
    return index >= 0 ? (state.matches[index] ?? null) : null;
  };
  const getTargetSnapshot = (
    targetId: string,
  ): SessionMessageSearchTargetSnapshot => {
    const activeMatch = getActiveMatch();
    const nextSnapshot = {
      query: state.matches.some((match) => match.targetId === targetId)
        ? state.query
        : "",
      activeMatchIndex:
        activeMatch?.targetId === targetId ? activeMatch.targetMatchIndex : -1,
    };
    const cached = targetSnapshots.get(targetId);
    if (
      cached?.query === nextSnapshot.query &&
      cached.activeMatchIndex === nextSnapshot.activeMatchIndex
    ) {
      return cached;
    }
    targetSnapshots.set(targetId, nextSnapshot);
    return nextSnapshot;
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
      isRemoteLoading: state.isRemoteLoading,
      remoteResults: state.remoteResults,
      remoteHasMore: state.remoteHasMore,
      remoteLoadFailed: state.remoteLoadFailed,
    };
  };
  const emit = () => {
    refreshSnapshot();
    listeners.forEach((listener) => listener());
  };
  const clearPendingRemoteTimeout = () => {
    if (pendingRemoteTimeout === null) return;
    window.clearTimeout(pendingRemoteTimeout);
    pendingRemoteTimeout = null;
  };
  const rebuildHighlightRegistry = () => {
    targets.forEach((target) =>
      target.root.removeAttribute(HIDDEN_MATCH_ATTRIBUTE),
    );
    const activeMatch = getActiveMatch();
    const activeTarget = activeMatch
      ? targets.get(activeMatch.targetId)
      : undefined;
    const activeRange = activeMatch
      ? activeTarget?.ranges[activeMatch.targetMatchIndex]
      : undefined;
    if (activeMatch && activeTarget && !activeRange) {
      activeTarget.root.setAttribute(HIDDEN_MATCH_ATTRIBUTE, "");
    }

    const api = getHighlightApi();
    if (!api) return;

    const ranges = [...targets.values()].flatMap((target) => target.ranges);
    if (ranges.length > 0) {
      api.registry.set(MATCH_HIGHLIGHT_NAME, new api.Constructor(...ranges));
    } else {
      api.registry.delete(MATCH_HIGHLIGHT_NAME);
    }

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
    target.textSnapshot ??= getTextSearchSnapshot(target.root);
    const expectedRangeCount = state.matches.filter(
      (match) => match.targetId === targetId,
    ).length;
    if (expectedRangeCount === 0) {
      target.ranges = [];
      return;
    }
    const ranges = getTextSearchRanges(target.textSnapshot, state.query);
    // The corpus is segmented by rendered field/message, while the DOM is a
    // flattened tree. Never index into a differently sized range list: JSON
    // virtualization, collapsed content, and renderer-only labels would make
    // next/previous land on the wrong occurrence.
    target.ranges = ranges.length === expectedRangeCount ? ranges : [];
  };
  const scrollToActiveRange = () => {
    const activeMatch = getActiveMatch();
    if (!activeMatch) return;
    const target = targets.get(activeMatch.targetId);
    const range = target?.ranges[activeMatch.targetMatchIndex];
    const element =
      range?.startContainer.parentElement ??
      (range?.startContainer instanceof HTMLElement
        ? range.startContainer
        : target?.root);
    element?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
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
      if (state.documentsDirty) {
        state.documents = getLocalDocuments();
        state.documentsDirty = false;
      }
      rebuildHighlightRegistry();
      if (activeTargetWasRefreshed) scrollToActiveRange();
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
    state.matches = buildMatches(state.documents, state.query);
    if (state.matches.length === 0) {
      state.activeMatchKey = null;
    } else if (
      !previousKey ||
      !state.matches.some((match) => match.key === previousKey)
    ) {
      state.activeMatchKey = state.matches[0]?.key ?? null;
    }
    const localObservationIds = new Set(
      state.matches.map((match) => match.observationId),
    );
    state.remoteResults = state.remoteResults.filter(
      (result) => !localObservationIds.has(result.observationId),
    );
    targets.forEach((_target, targetId) => refreshTarget(targetId));
    syncActiveMatch();
  };
  const refreshLocalDocuments = () => {
    state.documents = getLocalDocuments();
    state.documentsDirty = false;
    recomputeMatches();
  };
  const scheduleRemoteSearch = () => {
    clearPendingRemoteTimeout();
    const generation = ++remoteGeneration;
    state.remoteResults = [];
    state.remoteHasMore = false;
    state.remoteLoadFailed = false;

    const remoteQuery = state.query.trim();
    if (!remoteQuery) {
      state.isRemoteLoading = false;
      return;
    }

    state.isRemoteLoading = true;
    const query = state.query;
    const localObservationIds = new Set(
      state.matches.map((match) => match.observationId),
    );
    pendingRemoteTimeout = window.setTimeout(() => {
      pendingRemoteTimeout = null;
      searchRemote(remoteQuery, localObservationIds).then(
        (result) => {
          if (generation !== remoteGeneration || query !== state.query) return;
          const localObservationIds = new Set(
            state.matches.map((match) => match.observationId),
          );
          state.remoteResults = result.results.filter(
            (remoteResult) =>
              !localObservationIds.has(remoteResult.observationId),
          );
          state.remoteHasMore = result.hasMore;
          state.isRemoteLoading = false;
          emit();
        },
        () => {
          if (generation !== remoteGeneration || query !== state.query) return;
          state.isRemoteLoading = false;
          state.remoteLoadFailed = true;
          emit();
        },
      );
    }, SEARCH_INPUT_DEBOUNCE_MS);
  };
  const commitQuery = (query: string) => {
    state.query = query;
    if (query && state.documentsDirty) {
      refreshLocalDocuments();
    } else {
      recomputeMatches();
    }
    scheduleRemoteSearch();
  };
  const moveActiveMatch = (direction: 1 | -1) => {
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
    getTargetSnapshot,
    dispose() {
      clearPendingRemoteTimeout();
      remoteGeneration++;
      targets.forEach((target) => target.observer?.disconnect());
      if (pendingTargetFrameId !== null)
        cancelAnimationFrame(pendingTargetFrameId);
      dirtyTargetIds.clear();
      targets.clear();
      targetSnapshots.clear();
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
      clearPendingRemoteTimeout();
      remoteGeneration++;
      state.isOpen = false;
      state.queryInput = "";
      state.query = "";
      state.matches = [];
      state.activeMatchKey = null;
      state.isRemoteLoading = false;
      state.remoteResults = [];
      state.remoteHasMore = false;
      state.remoteLoadFailed = false;
      targets.forEach((target) => {
        target.ranges = [];
      });
      rebuildHighlightRegistry();
      emit();
    },
    setQueryInput(value) {
      if (state.queryInput === value) return;
      state.queryInput = value;
      commitQuery(value);
      emit();
    },
    blurQueryInput() {
      if (state.queryInput.trim() !== "") return;
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
      state.documentsDirty = true;
      commitQuery(state.query);
      emit();
    },
    setTraceNavigator(nextNavigateToTrace) {
      navigateToTrace = nextNavigateToTrace;
    },
    setRemoteNavigator(nextNavigateToResult) {
      navigateToRemoteResult = nextNavigateToResult;
    },
    openRemoteResult(result) {
      navigateToRemoteResult?.(result);
    },
    registerTarget(targetId, root) {
      const existing = targets.get(targetId);
      existing?.observer?.disconnect();

      const target: SessionSearchTarget = {
        root,
        observer: null,
        ranges: [],
        textSnapshot: null,
      };
      target.observer =
        typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(() => {
              const currentTarget = targets.get(targetId);
              if (currentTarget) currentTarget.textSnapshot = null;
              scheduleTargetRefresh(targetId);
            });
      target.observer?.observe(root, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
        attributeFilter: ["aria-hidden", "class", "hidden", "style"],
      });
      targets.set(targetId, target);
      state.documentsDirty = true;
      scheduleTargetRefresh(targetId);
    },
    unregisterTarget(targetId) {
      const target = targets.get(targetId);
      target?.observer?.disconnect();
      dirtyTargetIds.delete(targetId);
      targets.delete(targetId);
      targetSnapshots.delete(targetId);
      rebuildHighlightRegistry();
    },
  };
}
