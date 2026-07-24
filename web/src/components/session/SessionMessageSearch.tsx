"use client";

import chunk from "lodash/chunk";
import {
  ChevronDown,
  ChevronUp,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { type FilterState } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  buildSessionSearchDocuments,
  createSessionMessageSearchController,
  type SessionMessageSearchController,
  type SessionSearchDocument,
  type SessionSearchDocumentLoader,
} from "@/src/components/session/sessionMessageSearchController";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const SEARCH_FETCH_CONCURRENCY = 6;

const SessionMessageSearchContext =
  createContext<SessionMessageSearchController | null>(null);

type ObservationsResponse =
  RouterOutputs["sessions"]["observationsForTraceFromEvents"];

function normalizeObservationsResponse(
  response:
    | ObservationsResponse
    | { observations?: ObservationsResponse }
    | undefined,
): ObservationsResponse {
  return Array.isArray(response) ? response : (response?.observations ?? []);
}

export function useSessionMessageSearchController({
  enabled,
  traces,
  projectId,
  sessionId,
  filterState,
  scopeKey,
  showInlineToolCalls,
  showSystemPrompt,
}: {
  enabled: boolean;
  traces: EventSessionTrace[];
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  scopeKey: string;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const loaderRef = useRef<SessionSearchDocumentLoader>(async () => ({
    documents: [],
    failedTraceCount: 0,
  }));
  loaderRef.current = async ({ signal, onProgress }) => {
    const documents: SessionSearchDocument[] = [];
    const traceIndexById = new Map(
      traces.map((trace, traceIndex) => [trace.id, traceIndex]),
    );
    let failedTraceCount = 0;
    let completedTraceCount = 0;

    onProgress({
      completedTraceCount,
      totalTraceCount: traces.length,
    });

    for (const traceChunk of chunk(traces, SEARCH_FETCH_CONCURRENCY)) {
      if (signal.aborted) break;
      const results = await Promise.allSettled(
        traceChunk.map((trace) => {
          const input = {
            projectId,
            sessionId,
            traceId: trace.id,
            filter: filterState,
          };
          return (
            utils.sessions.observationsForTraceFromEvents.getData(input) ??
            utils.sessions.observationsForTraceFromEvents.fetch(input)
          );
        }),
      );
      if (signal.aborted) break;

      results.forEach((result, chunkIndex) => {
        const trace = traceChunk[chunkIndex];
        if (!trace) return;
        if (result.status === "rejected") {
          failedTraceCount++;
          return;
        }

        documents.push(
          ...buildSessionSearchDocuments({
            traceId: trace.id,
            traceIndex: traceIndexById.get(trace.id) ?? 0,
            observations: normalizeObservationsResponse(
              result.value as
                | ObservationsResponse
                | { observations?: ObservationsResponse },
            ) as SessionTraceObservation[],
            contentMode: showInlineToolCalls ? "all" : "conversation",
            showSystemPrompt,
          }),
        );
      });

      completedTraceCount += traceChunk.length;
      onProgress({
        completedTraceCount,
        totalTraceCount: traces.length,
      });
    }

    return { documents, failedTraceCount };
  };

  const [controller] = useState(() =>
    createSessionMessageSearchController({
      loadDocuments: (options) => loaderRef.current(options),
    }),
  );

  useEffect(() => {
    controller.setScope(scopeKey);
  }, [controller, scopeKey]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLocaleLowerCase() === "f"
      ) {
        event.preventDefault();
        if (!controller.getSnapshot().isOpen) {
          capture("session_detail:message_search_open", {
            trigger: "shortcut",
            isV4: true,
          });
        }
        controller.openSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [capture, controller, enabled]);

  return controller;
}

export function SessionMessageSearchProvider({
  children,
  controller,
}: {
  children: ReactNode;
  controller: SessionMessageSearchController;
}) {
  return (
    <SessionMessageSearchContext.Provider value={controller}>
      {children}
    </SessionMessageSearchContext.Provider>
  );
}

function useSessionMessageSearchContext() {
  const controller = useContext(SessionMessageSearchContext);
  if (!controller) {
    throw new Error(
      "Session message search must be used within SessionMessageSearchProvider",
    );
  }
  return controller;
}

export function useSessionMessageSearchQuery() {
  const controller = useSessionMessageSearchContext();
  return useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().query,
    () => controller.getSnapshot().query,
  );
}

export function SessionMessageSearchTarget({
  children,
  targetId,
}: {
  children: ReactNode;
  targetId: string;
}) {
  const controller = useSessionMessageSearchContext();
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = targetRef.current;
    if (!root) return;
    controller.registerTarget(targetId, root);
    return () => controller.unregisterTarget(targetId);
  }, [controller, targetId]);

  return (
    <div
      ref={targetRef}
      data-session-message-search-target={targetId}
      className="data-[session-search-hidden-match]:ring-find-match-selected-background rounded-sm data-[session-search-hidden-match]:ring-2"
    >
      {children}
    </div>
  );
}

export function SessionMessageSearchToolbar({
  className,
  controller,
}: {
  className?: string;
  controller: SessionMessageSearchController;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const capture = usePostHogClientCapture();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!snapshot.isOpen) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [snapshot.isOpen, snapshot.openRequestCount]);

  if (!snapshot.isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn("h-9 gap-2", className)}
        onClick={() => {
          capture("session_detail:message_search_open", {
            trigger: "button",
            isV4: true,
          });
          controller.openSearch();
        }}
        aria-label="Find in session messages"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Find</span>
      </Button>
    );
  }

  const countText = snapshot.isLoading
    ? snapshot.totalTraceCount > 0
      ? `${snapshot.completedTraceCount} / ${snapshot.totalTraceCount} traces`
      : "Searching…"
    : snapshot.matches.length === 0 || snapshot.activeMatchIndex < 0
      ? "0 / 0"
      : `${snapshot.activeMatchIndex + 1} / ${snapshot.matches.length}`;
  const hasPartialFailure =
    snapshot.failedTraceCount > 0 || snapshot.loadFailed;
  const partialFailureText = snapshot.loadFailed
    ? "Session messages could not be searched"
    : `${snapshot.failedTraceCount} traces could not be searched`;

  return (
    <div
      className={cn(
        "bg-background flex h-9 items-center gap-1 rounded-md border px-1",
        className,
      )}
    >
      <Search className="text-muted-foreground ml-1 h-3.5 w-3.5 shrink-0" />
      <Input
        ref={inputRef}
        value={snapshot.queryInput}
        onChange={(event) => controller.setQueryInput(event.target.value)}
        onBlur={controller.blurQueryInput}
        placeholder="Find in session messages"
        className="h-7 min-w-40 border-0 px-1 text-xs shadow-none focus-visible:ring-0 sm:min-w-56"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) {
              controller.previousMatch();
            } else {
              controller.nextMatch();
            }
          }
          if (event.key === "Escape") {
            event.preventDefault();
            if (snapshot.queryInput) {
              controller.setQueryInput("");
            } else {
              controller.closeSearch();
            }
          }
        }}
      />
      <span className="text-muted-foreground min-w-16 px-1 text-right text-xs whitespace-nowrap">
        {countText}
      </span>
      {hasPartialFailure ? (
        <span title={partialFailureText}>
          <TriangleAlert
            className="h-3.5 w-3.5 shrink-0 text-amber-600"
            aria-label={partialFailureText}
          />
        </span>
      ) : null}
      <SearchIconButton
        icon={ChevronUp}
        label="Previous result"
        onClick={controller.previousMatch}
        disabled={snapshot.isLoading || snapshot.matches.length === 0}
      />
      <SearchIconButton
        icon={ChevronDown}
        label="Next result"
        onClick={controller.nextMatch}
        disabled={snapshot.isLoading || snapshot.matches.length === 0}
      />
      <SearchIconButton
        icon={X}
        label="Close search"
        onClick={controller.closeSearch}
      />
    </div>
  );
}

function SearchIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}
