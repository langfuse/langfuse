"use client";

import capitalize from "lodash/capitalize";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { ChatMessageType, type ChatMessageWithId } from "@langfuse/shared";
import { type RefObject } from "react";

import {
  applyCodeMirrorSearchQuery,
  selectCodeMirrorRange,
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

export type MessageSearchController = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => MessageSearchSnapshot;
  dispose: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  setQueryInput: (value: string) => void;
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

  const lowerQuery = searchQuery.toLocaleLowerCase();
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

      const lowerText = text.toLocaleLowerCase();
      let from = lowerText.indexOf(lowerQuery);

      while (from !== -1) {
        const label = getMessageSearchLabel(message, messageIndex);
        const pageLabel = state.getPageLabel?.(pageId, pageIndex);
        const matchWithoutKey = {
          pageId,
          messageId: message.id,
          label,
          locationLabel: pageLabel ? `${pageLabel} · ${label}` : label,
          from,
          to: from + searchQuery.length,
          text,
        };

        allMatches.push({
          key: getMatchKey(matchWithoutKey),
          ...matchWithoutKey,
        });

        from = lowerText.indexOf(
          lowerQuery,
          from + Math.max(1, lowerQuery.length),
        );
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

  const syncEditorsToQuery = () => {
    const query = getCommittedQuery(state);

    for (const target of messageTargets.values()) {
      applyCodeMirrorSearchQuery(target.editorRef, query);
    }
  };

  const syncActiveMatchTarget = () => {
    const activeMatch = getActiveMatch(state);
    if (!activeMatch) {
      return;
    }

    pageTargets.get(activeMatch.pageId)?.pageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });

    const messageTarget = messageTargets.get(
      getMessageTargetKey(activeMatch.pageId, activeMatch.messageId),
    );

    messageTarget?.rowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });

    selectCodeMirrorRange(messageTarget?.editorRef, {
      from: activeMatch.from,
      to: activeMatch.to,
    });
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

  const refreshSearchResults = (shouldSyncEditors: boolean) => {
    const activeMatchChanged = recomputeMatches();

    if (shouldSyncEditors) {
      syncEditorsToQuery();
    }

    if (shouldSyncEditors || activeMatchChanged) {
      syncActiveMatchTarget();
    }
  };

  const refreshSearchResultsIfSearching = (shouldSyncEditors: boolean) => {
    if (!getCommittedQuery(state)) {
      return;
    }

    refreshSearchResults(shouldSyncEditors);
    emit();
  };

  const commitSearchQuery = (nextSearchQuery: string) => {
    if (state.searchQuery === nextSearchQuery) {
      return false;
    }

    state.searchQuery = nextSearchQuery;
    refreshSearchResults(true);
    return true;
  };

  const flushPendingQuery = () => {
    if (pendingQueryTimeout === null) {
      return false;
    }

    clearPendingQueryTimeout();

    const queryChanged = commitSearchQuery(state.queryInput.trim());
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

      const nextSearchQuery = value.trim();
      if (nextSearchQuery === "") {
        commitSearchQuery("");
        emit();
        return;
      }

      emit();

      if (nextSearchQuery === state.searchQuery) {
        return;
      }

      pendingQueryTimeout = window.setTimeout(() => {
        pendingQueryTimeout = null;

        const queryChanged = commitSearchQuery(nextSearchQuery);
        if (queryChanged) {
          emit();
        }
      }, SEARCH_INPUT_DEBOUNCE_MS);
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
      refreshSearchResultsIfSearching(false);
    },

    setPageLabelResolver(getPageLabel) {
      if (state.getPageLabel === getPageLabel) {
        return;
      }

      state.getPageLabel = getPageLabel;
      refreshSearchResultsIfSearching(false);
    },

    registerPageMessages(pageId, messages) {
      state.pageMessagesById[pageId] = messages;
      refreshSearchResultsIfSearching(false);
    },

    unregisterPageMessages(pageId) {
      if (!(pageId in state.pageMessagesById)) {
        return;
      }

      delete state.pageMessagesById[pageId];
      refreshSearchResultsIfSearching(false);
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
      messageTargets.set(getMessageTargetKey(pageId, messageId), target);

      applyCodeMirrorSearchQuery(target.editorRef, getCommittedQuery(state));

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
