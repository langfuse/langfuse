"use client";

import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
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
  type RefObject,
} from "react";
import { type FilterState } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  buildSessionSearchDocuments,
  createSessionMessageSearchController,
  loadSessionSearchRemoteResults,
  type SessionMessageSearchController,
  type SessionSearchDocument,
  type SessionSearchRemoteLoadResult,
} from "@/src/components/session/sessionMessageSearchController";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { type ViewMode } from "@/src/components/trace/components/IOPreview/components/ChatMessage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const SESSION_MESSAGE_SEARCH_RESULT_LIMIT = 50;

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
  captureRootRef,
}: {
  enabled: boolean;
  traces: EventSessionTrace[];
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  scopeKey: string;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  captureRootRef?: RefObject<HTMLElement | null>;
}) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [jsonViewPreference] = useLocalStorage<ViewMode>(
    "jsonViewPreference",
    "pretty",
  );
  const documentScope = `${scopeKey}:${jsonViewPreference}`;
  const localDocumentCacheRef = useRef<{
    scope: string;
    traces: Map<
      string,
      {
        response: unknown;
        traceIndex: number;
        documents: SessionSearchDocument[];
      }
    >;
  }>({ scope: "", traces: new Map() });
  const getLocalDocumentsRef = useRef<() => SessionSearchDocument[]>(() => []);
  getLocalDocumentsRef.current = () => {
    if (localDocumentCacheRef.current.scope !== documentScope) {
      localDocumentCacheRef.current = {
        scope: documentScope,
        traces: new Map(),
      };
    }

    const documents: SessionSearchDocument[] = [];

    for (const [traceIndex, trace] of traces.entries()) {
      const response = utils.sessions.observationsForTraceFromEvents.getData({
        projectId,
        sessionId,
        traceId: trace.id,
        filter: filterState,
      });
      if (!response) continue;

      const cached = localDocumentCacheRef.current.traces.get(trace.id);
      if (cached?.response === response && cached.traceIndex === traceIndex) {
        documents.push(...cached.documents);
        continue;
      }

      const traceDocuments = buildSessionSearchDocuments({
        traceId: trace.id,
        traceIndex,
        observations: normalizeObservationsResponse(
          response,
        ) as SessionTraceObservation[],
        contentMode: showInlineToolCalls ? "all" : "conversation",
        showSystemPrompt,
        includeMetadata: jsonViewPreference !== "pretty",
      });
      localDocumentCacheRef.current.traces.set(trace.id, {
        response,
        traceIndex,
        documents: traceDocuments,
      });
      documents.push(...traceDocuments);
    }

    return documents;
  };

  const searchRemoteRef = useRef<
    (
      query: string,
      localObservationIds: ReadonlySet<string>,
    ) => Promise<SessionSearchRemoteLoadResult>
  >(async () => ({ results: [], hasMore: false }));
  searchRemoteRef.current = async (query, localObservationIds) => {
    const traceIndexById = new Map(
      traces.map((trace, traceIndex) => [trace.id, traceIndex]),
    );

    return loadSessionSearchRemoteResults({
      limit: SESSION_MESSAGE_SEARCH_RESULT_LIMIT,
      localObservationIds,
      traceIndexById,
      loadPage: ({ limit, offset }) =>
        utils.sessions.searchMessages.fetch({
          projectId,
          sessionId,
          query,
          filter: filterState,
          limit,
          offset,
        }),
    });
  };

  const [controller] = useState(() =>
    createSessionMessageSearchController({
      getLocalDocuments: () => getLocalDocumentsRef.current(),
      searchRemote: (query, localObservationIds) =>
        searchRemoteRef.current(query, localObservationIds),
    }),
  );

  useEffect(() => {
    controller.setScope(documentScope);
  }, [controller, documentScope]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const captureRoot = captureRootRef?.current;
      if (
        !isSessionSearchShortcutInScope(
          captureRoot,
          event.target,
          document.activeElement,
        )
      ) {
        return;
      }

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
  }, [capture, captureRootRef, controller, enabled]);

  return controller;
}

export function isSessionSearchShortcutInScope(
  captureRoot: HTMLElement | null | undefined,
  eventTarget: EventTarget | null,
  activeElement: Element | null,
) {
  if (!captureRoot) return true;

  const targetIsInsideRoot =
    eventTarget instanceof Node && captureRoot.contains(eventTarget);
  const activeElementIsInsideRoot =
    activeElement instanceof Node && captureRoot.contains(activeElement);
  const targetIsSearchControl =
    eventTarget instanceof Element &&
    Boolean(eventTarget.closest("[data-session-message-search-control]"));
  const activeElementIsSearchControl =
    activeElement instanceof Element &&
    Boolean(activeElement.closest("[data-session-message-search-control]"));
  const activeElementIsPage =
    activeElement === null ||
    activeElement === document.body ||
    activeElement === document.documentElement;
  const eventTargetIsPage =
    eventTarget === document ||
    eventTarget === document.body ||
    eventTarget === document.documentElement;

  return (
    targetIsInsideRoot ||
    activeElementIsInsideRoot ||
    targetIsSearchControl ||
    activeElementIsSearchControl ||
    (activeElementIsPage && eventTargetIsPage)
  );
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

export function useSessionMessageSearchTargetState(targetId: string) {
  const controller = useSessionMessageSearchContext();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    () => controller.getTargetSnapshot(targetId),
    () => controller.getTargetSnapshot(targetId),
  );

  return snapshot;
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
        data-session-message-search-control
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

  const countText =
    snapshot.matches.length === 0 || snapshot.activeMatchIndex < 0
      ? "0 / 0"
      : `${snapshot.activeMatchIndex + 1} / ${snapshot.matches.length}`;
  const remoteResultCountText = `${snapshot.remoteResults.length}${snapshot.remoteHasMore ? "+" : ""} more`;

  return (
    <div
      data-session-message-search-control
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
        maxLength={500}
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
      {snapshot.isRemoteLoading && snapshot.query ? (
        <span className="text-muted-foreground flex items-center gap-1 px-1 text-xs whitespace-nowrap">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Searching session…
        </span>
      ) : null}
      {!snapshot.isRemoteLoading && snapshot.remoteResults.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
            >
              {remoteResultCountText}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1">
            <div className="text-muted-foreground px-2 py-1.5 text-xs">
              Full-session results
            </div>
            <div className="max-h-72 overflow-y-auto">
              {snapshot.remoteResults.map((result) => (
                <PopoverClose asChild key={result.key}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full flex-col rounded-sm px-2 py-1.5 text-left"
                    onClick={() => {
                      capture(
                        "session_detail:message_search_remote_result_select",
                        {
                          isV4: true,
                          hasMore: snapshot.remoteHasMore,
                        },
                      );
                      controller.openRemoteResult(result);
                    }}
                  >
                    <span
                      className="w-full truncate text-sm font-bold"
                      title={result.observationName ?? "Observation"}
                    >
                      {result.observationName ?? "Observation"}
                    </span>
                    <span
                      className="text-muted-foreground w-full truncate text-xs"
                      title={`${result.traceName ?? result.traceId} · ${result.startTime.toLocaleString()}`}
                    >
                      {result.traceName ?? result.traceId} ·{" "}
                      {result.startTime.toLocaleString()}
                    </span>
                  </button>
                </PopoverClose>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      {snapshot.remoteLoadFailed ? (
        <span title="Full-session results could not be loaded">
          <TriangleAlert
            className="h-3.5 w-3.5 shrink-0 text-amber-600"
            aria-label="Full-session results could not be loaded"
          />
        </span>
      ) : null}
      <SearchIconButton
        icon={ChevronUp}
        label="Previous result"
        onClick={controller.previousMatch}
        disabled={snapshot.matches.length === 0}
      />
      <SearchIconButton
        icon={ChevronDown}
        label="Next result"
        onClick={controller.nextMatch}
        disabled={snapshot.matches.length === 0}
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
