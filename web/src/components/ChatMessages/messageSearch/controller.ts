"use client";

import capitalize from "lodash/capitalize";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChatMessageType, type ChatMessageWithId } from "@langfuse/shared";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { type RefObject } from "react";

import {
  applyCodeMirrorSearchQuery,
  unsetActiveSearchMarkCodeMirrorRange,
  setActiveSearchMarkCodeMirrorRange,
} from "@/src/components/editor";

export type MessageSearchMatch = {
  key: string;
  pageId: string;
  messageId: string;
  label: string;
  locationLabel: string;
  from: number;
  to: number;
  text: string;
};

export type MessageSearchSnapshot = {
  isOpen: boolean;
  openRequestCount: number;
  queryInput: string;
  query: string;
  matches: MessageSearchMatch[];
  activeMatch: MessageSearchMatch | null;
  activeMatchIndex: number;
};

export type MessageSearchPageLabelResolver = (
  pageId: string,
  pageIndex: number,
) => string | null;

type MessageSearchState = {
  isOpen: boolean;
  openRequestCount: number;
  queryInput: string;
  searchQuery: string;
  activeMatchKey: string | null;
  matches: MessageSearchMatch[];
  pageIds: string[];
  getPageLabel?: MessageSearchPageLabelResolver;
  pageMessagesById: Record<string, ChatMessageWithId[]>;
};

type MessageSearchPageTarget = {
  pageRef: RefObject<HTMLDivElement | null>;
};

type MessageSearchMessageTarget = {
  rowRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<ReactCodeMirrorRef | null>;
};

type RefreshSearchOptions = {
  syncEditors?: boolean;
  scrollToActiveMatch?: boolean;
};

type SearchMatchRange = {
  from: number;
  to: number;
};

type SyncActiveMatchTargetOptions = {
  scrollIntoView?: boolean;
};

export type MessageSearchController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => MessageSearchSnapshot;
  dispose: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setQueryInput: (value: string) => void;
  blurQueryInput: () => void;
  nextMatch: () => void;
  previousMatch: () => void;
  setPageIds: (pageIds: string[]) => void;
  setPageLabelResolver: (getPageLabel?: MessageSearchPageLabelResolver) => void;
  registerPageMessages: (pageId: string, messages: ChatMessageWithId[]) => void;
  unregisterPageMessages: (pageId: string) => void;
  registerPageTarget: (pageId: string, target: MessageSearchPageTarget) => void;
  unregisterPageTarget: (pageId: string) => void;
  registerMessageTarget: (
    pageId: string,
    messageId: string,
    target: MessageSearchMessageTarget,
  ) => void;
  unregisterMessageTarget: (pageId: string, messageId: string) => void;
};

const SEARCH_INPUT_DEBOUNCE_MS = 150;

function getMessageSearchText(message: ChatMessageWithId) {
  if (message.type === ChatMessageType.Placeholder) {
    return message.name ?? "";
  }

  return typeof message.content === "string" ? message.content : "";
}

function getMessageSearchLabel(message: ChatMessageWithId, index: number) {
  if (message.type === ChatMessageType.Placeholder) {
    return `Placeholder ${index + 1}`;
  }

  if ("role" in message) {
    return `${capitalize(message.role)} message ${index + 1}`;
  }

  return `Message ${index + 1}`;
}

function getMatchKey(match: Omit<MessageSearchMatch, "key">) {
  return `${match.pageId}:${match.messageId}:${match.from}:${match.to}`;
}

function getMessageTargetKey(pageId: string, messageId: string) {
  return `${pageId}:${messageId}`;
}

function getCommittedQuery(state: MessageSearchState) {
  return state.searchQuery;
}

function getActiveMatchIndex(state: MessageSearchState) {
  if (!state.activeMatchKey) {
    return -1;
  }

  return state.matches.findIndex((match) => match.key === state.activeMatchKey);
}

function getActiveMatch(state: MessageSearchState) {
  const activeMatchIndex = getActiveMatchIndex(state);

  return activeMatchIndex >= 0
    ? (state.matches[activeMatchIndex] ?? null)
    : null;
}

function buildMatches(state: MessageSearchState) {
  const searchQuery = getCommittedQuery(state);
  if (!searchQuery) {
    return [];
  }

  const codeMirrorSearchQuery = new SearchQuery({
    search: searchQuery,
    caseSensitive: false,
    literal: true,
  });
  const allMatches: MessageSearchMatch[] = [];

  for (const [pageIndex, pageId] of state.pageIds.entries()) {
    const pageMessages = state.pageMessagesById[pageId];
    if (!pageMessages) {
      continue;
    }

    for (const [messageIndex, message] of pageMessages.entries()) {
      const text = getMessageSearchText(message);
      if (!text) {
        continue;
      }

      const cursor = codeMirrorSearchQuery.getCursor(
        EditorState.create({ doc: text }),
      );
      let match = cursor.next();

      while (!match.done) {
        const { from, to } = match.value;
        const label = getMessageSearchLabel(message, messageIndex);
        const pageLabel = state.getPageLabel?.(pageId, pageIndex);
        const matchWithoutKey = {
          pageId,
          messageId: message.id,
          label,
          locationLabel: pageLabel ? `${pageLabel} · ${label}` : label,
          from,
          to,
          text,
        };

        allMatches.push({
          key: getMatchKey(matchWithoutKey),
          ...matchWithoutKey,
        });

        match = cursor.next();
      }
    }
  }

  return allMatches;
}

function arePageIdsEqual(currentPageIds: string[], nextPageIds: string[]) {
  if (currentPageIds.length !== nextPageIds.length) {
    return false;
  }

  return currentPageIds.every((pageId, index) => pageId === nextPageIds[index]);
}

export function createMessageSearchController(
  initialPageIds: string[],
  initialPageLabelResolver?: MessageSearchPageLabelResolver,
): MessageSearchController {
  const state: MessageSearchState = {
    isOpen: false,
    openRequestCount: 0,
    queryInput: "",
    searchQuery: "",
    activeMatchKey: null,
    matches: [],
    pageIds: initialPageIds,
    getPageLabel: initialPageLabelResolver,
    pageMessagesById: {},
  };
  const listeners = new Set<() => void>();
  const pageTargets = new Map<string, MessageSearchPageTarget>();
  const messageTargets = new Map<string, MessageSearchMessageTarget>();
  let pendingQueryTimeout: number | null = null;
  let cachedSnapshot: MessageSearchSnapshot = {
    isOpen: state.isOpen,
    openRequestCount: state.openRequestCount,
    queryInput: state.queryInput,
    query: getCommittedQuery(state),
    matches: state.matches,
    activeMatch: getActiveMatch(state),
    activeMatchIndex: getActiveMatchIndex(state),
  };

  const refreshSnapshot = () => {
    cachedSnapshot = {
      isOpen: state.isOpen,
      openRequestCount: state.openRequestCount,
      queryInput: state.queryInput,
      query: getCommittedQuery(state),
      matches: state.matches,
      activeMatch: getActiveMatch(state),
      activeMatchIndex: getActiveMatchIndex(state),
    };
  };

  const emit = () => {
    refreshSnapshot();

    for (const listener of listeners) {
      listener();
    }
  };

  const clearPendingQueryTimeout = () => {
    if (pendingQueryTimeout === null) {
      return;
    }

    window.clearTimeout(pendingQueryTimeout);
    pendingQueryTimeout = null;
  };

  const getMatchRangesForMessageTarget = (pageId: string, messageId: string) =>
    state.matches
      .filter(
        (match) => match.pageId === pageId && match.messageId === messageId,
      )
      .map((match) => ({ from: match.from, to: match.to }));

  const syncEditorsToQuery = () => {
    const query = getCommittedQuery(state);
    const matchRangesByTargetKey = new Map<string, SearchMatchRange[]>();

    for (const match of state.matches) {
      const targetKey = getMessageTargetKey(match.pageId, match.messageId);
      const ranges = matchRangesByTargetKey.get(targetKey);

      if (ranges) {
        ranges.push({ from: match.from, to: match.to });
      } else {
        matchRangesByTargetKey.set(targetKey, [
          { from: match.from, to: match.to },
        ]);
      }
    }

    for (const [targetKey, target] of messageTargets.entries()) {
      applyCodeMirrorSearchQuery(
        target.editorRef,
        query,
        matchRangesByTargetKey.get(targetKey) ?? [],
      );
    }
  };

  const syncActiveMatchTarget = ({
    scrollIntoView = true,
  }: SyncActiveMatchTargetOptions = {}) => {
    const activeMatch = getActiveMatch(state);
    if (!activeMatch) {
      return;
    }

    if (scrollIntoView) {
      pageTargets.get(activeMatch.pageId)?.pageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }

    let activeMessageTarget: MessageSearchMessageTarget | null = null;
    const inactiveMessageTargets: MessageSearchMessageTarget[] = [];

    const activeMessageTargetKey = getMessageTargetKey(
      activeMatch.pageId,
      activeMatch.messageId,
    );

    for (const [key, target] of messageTargets.entries()) {
      if (key === activeMessageTargetKey) {
        activeMessageTarget = target;
      } else {
        inactiveMessageTargets.push(target);
      }
    }

    for (const target of inactiveMessageTargets) {
      unsetActiveSearchMarkCodeMirrorRange(target?.editorRef);
    }

    if (scrollIntoView) {
      activeMessageTarget?.rowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }

    setActiveSearchMarkCodeMirrorRange(
      activeMessageTarget?.editorRef,
      {
        from: activeMatch.from,
        to: activeMatch.to,
      },
      { scrollIntoView },
    );
  };

  const recomputeMatches = () => {
    const committedQuery = getCommittedQuery(state);

    if (!committedQuery) {
      if (state.matches.length === 0 && state.activeMatchKey === null) {
        return false;
      }

      state.matches = [];
      const previousActiveMatchKey = state.activeMatchKey;
      state.activeMatchKey = null;

      return previousActiveMatchKey !== null;
    }

    const previousActiveMatchKey = state.activeMatchKey;
    state.matches = buildMatches(state);

    if (state.matches.length === 0) {
      state.activeMatchKey = null;
    } else if (
      !state.activeMatchKey ||
      !state.matches.some((match) => match.key === state.activeMatchKey)
    ) {
      state.activeMatchKey = state.matches[0]?.key ?? null;
    }

    return previousActiveMatchKey !== state.activeMatchKey;
  };

  const refreshSearchResults = ({
    syncEditors = false,
    scrollToActiveMatch = false,
  }: RefreshSearchOptions) => {
    const activeMatchChanged = recomputeMatches();
    const shouldSyncEditors = syncEditors || activeMatchChanged;
    const shouldScrollToActiveMatch = scrollToActiveMatch || activeMatchChanged;

    if (shouldSyncEditors) {
      syncEditorsToQuery();
    }

    // Redrawing the editor search marks clears the selected active-match mark,
    // so the active match must always be re-applied after syncing editors.
    if (shouldSyncEditors || shouldScrollToActiveMatch) {
      syncActiveMatchTarget({ scrollIntoView: shouldScrollToActiveMatch });
    }
  };

  const refreshSearchResultsIfSearching = (options: RefreshSearchOptions) => {
    if (!getCommittedQuery(state)) {
      return;
    }

    refreshSearchResults(options);
    emit();
  };

  const commitSearchQuery = (nextSearchQuery: string) => {
    if (state.searchQuery === nextSearchQuery) {
      return false;
    }

    state.searchQuery = nextSearchQuery;
    refreshSearchResults({ syncEditors: true, scrollToActiveMatch: true });
    return true;
  };

  const flushPendingQuery = () => {
    if (pendingQueryTimeout === null) {
      return false;
    }

    clearPendingQueryTimeout();

    const queryChanged = commitSearchQuery(state.queryInput);
    if (queryChanged) {
      emit();
    }

    return queryChanged;
  };

  const moveActiveMatch = (direction: 1 | -1) => {
    flushPendingQuery();

    if (state.matches.length === 0) {
      return;
    }

    if (!state.activeMatchKey) {
      state.activeMatchKey =
        direction > 0
          ? (state.matches[0]?.key ?? null)
          : (state.matches[state.matches.length - 1]?.key ?? null);
    } else {
      const currentIndex = state.matches.findIndex(
        (match) => match.key === state.activeMatchKey,
      );
      const fallbackIndex = direction > 0 ? 0 : state.matches.length - 1;
      const nextIndex =
        currentIndex < 0
          ? fallbackIndex
          : (currentIndex + direction + state.matches.length) %
            state.matches.length;

      state.activeMatchKey = state.matches[nextIndex]?.key ?? null;
    }

    syncActiveMatchTarget();
    emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return cachedSnapshot;
    },

    dispose() {
      clearPendingQueryTimeout();
      listeners.clear();
      pageTargets.clear();
      messageTargets.clear();
    },

    openSearch() {
      state.isOpen = true;
      state.openRequestCount += 1;
      emit();
    },

    closeSearch() {
      const hadQuery = getCommittedQuery(state).length > 0;
      clearPendingQueryTimeout();

      state.isOpen = false;
      state.queryInput = "";
      state.searchQuery = "";
      state.matches = [];
      state.activeMatchKey = null;

      if (hadQuery) {
        syncEditorsToQuery();
      }

      emit();
    },

    setQueryInput(value) {
      if (state.queryInput === value) {
        return;
      }

      state.queryInput = value;
      clearPendingQueryTimeout();

      if (value === "") {
        commitSearchQuery("");
        emit();
        return;
      }

      emit();

      if (value === state.searchQuery) {
        return;
      }

      pendingQueryTimeout = window.setTimeout(() => {
        pendingQueryTimeout = null;

        const queryChanged = commitSearchQuery(value);
        if (queryChanged) {
          emit();
        }
      }, SEARCH_INPUT_DEBOUNCE_MS);
    },

    blurQueryInput() {
      if (state.queryInput.trim() !== "") {
        return;
      }

      clearPendingQueryTimeout();

      const queryChanged = commitSearchQuery("");
      const inputChanged = state.queryInput !== "";
      if (inputChanged) {
        state.queryInput = "";
      }

      if (queryChanged || inputChanged) {
        emit();
      }
    },

    nextMatch() {
      moveActiveMatch(1);
    },

    previousMatch() {
      moveActiveMatch(-1);
    },

    setPageIds(pageIds) {
      if (arePageIdsEqual(state.pageIds, pageIds)) {
        return;
      }

      state.pageIds = pageIds;
      refreshSearchResultsIfSearching({
        syncEditors: true,
      });
    },

    setPageLabelResolver(getPageLabel) {
      if (state.getPageLabel === getPageLabel) {
        return;
      }

      state.getPageLabel = getPageLabel;
      refreshSearchResultsIfSearching({});
    },

    registerPageMessages(pageId, messages) {
      state.pageMessagesById[pageId] = messages;
      refreshSearchResultsIfSearching({
        syncEditors: true,
      });
    },

    unregisterPageMessages(pageId) {
      if (!(pageId in state.pageMessagesById)) {
        return;
      }

      delete state.pageMessagesById[pageId];
      refreshSearchResultsIfSearching({
        syncEditors: true,
      });
    },

    registerPageTarget(pageId, target) {
      pageTargets.set(pageId, target);

      if (getActiveMatch(state)?.pageId === pageId) {
        syncActiveMatchTarget();
      }
    },

    unregisterPageTarget(pageId) {
      pageTargets.delete(pageId);
    },

    registerMessageTarget(pageId, messageId, target) {
      const targetKey = getMessageTargetKey(pageId, messageId);
      messageTargets.set(targetKey, target);

      applyCodeMirrorSearchQuery(
        target.editorRef,
        getCommittedQuery(state),
        getMatchRangesForMessageTarget(pageId, messageId),
      );

      const activeMatch = getActiveMatch(state);
      if (
        activeMatch?.pageId === pageId &&
        activeMatch.messageId === messageId
      ) {
        syncActiveMatchTarget();
      }
    },

    unregisterMessageTarget(pageId, messageId) {
      messageTargets.delete(getMessageTargetKey(pageId, messageId));
    },
  };
}
