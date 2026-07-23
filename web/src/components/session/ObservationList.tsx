import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Funnel,
} from "lucide-react";
import { type FilterState } from "@langfuse/shared";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";

import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { api, type RouterOutputs } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";

const OBSERVATION_LIST_OVERSCAN = 5;

/** Short type labels for the row badges, per the session-detail design. */
const TYPE_LABELS: Record<string, string> = { GENERATION: "GEN" };
const typeLabel = (type: string | null | undefined): string =>
  type ? (TYPE_LABELS[type] ?? type) : "SPAN";

/** Types offered by the funnel filter when nothing is loaded yet. */
const BASE_FILTER_TYPES = ["GENERATION", "SPAN", "TOOL", "EVENT"];

type ObservationsResponse =
  RouterOutputs["sessions"]["observationsForTraceFromEvents"];

/** Defensive against both response shapes (see TraceEventsRow, LFE-10958). */
const asObservationArray = (
  data: unknown,
): SessionTraceObservation[] | undefined =>
  Array.isArray(data)
    ? (data as ObservationsResponse)
    : ((data as { observations?: ObservationsResponse } | undefined)
        ?.observations ?? undefined);

const TurnObservationRows = ({
  trace,
  projectId,
  sessionId,
  filterState,
  typeFilter,
  search,
  onSelectTurn,
}: {
  trace: EventSessionTrace;
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  typeFilter: Set<string>;
  search: string;
  onSelectTurn: () => void;
}) => {
  const observationsQuery =
    api.sessions.observationsForTraceFromEvents.useQuery(
      { projectId, sessionId, traceId: trace.id, filter: filterState },
      { trpc: { context: { skipBatch: true } }, staleTime: 60 * 1000 },
    );

  const rows = useMemo(() => {
    const all = asObservationArray(observationsQuery.data);
    if (!all) return undefined;
    const query = search.trim().toLowerCase();
    return all
      .filter((observation) => observation.id !== `t-${trace.id}`)
      .filter(
        (observation) =>
          typeFilter.size === 0 || typeFilter.has(observation.type),
      )
      .filter(
        (observation) =>
          query === "" ||
          (observation.name ?? "").toLowerCase().includes(query),
      );
  }, [observationsQuery.data, trace.id, typeFilter, search]);

  if (observationsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-1 px-3 py-2">
        <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-2 text-xs">
        {search || typeFilter.size > 0
          ? "No matching spans"
          : "No observations"}
      </p>
    );
  }

  return (
    <div>
      {rows.map((observation) => (
        <button
          key={observation.id}
          type="button"
          onClick={onSelectTurn}
          className="hover:bg-muted/40 flex w-full items-center gap-2 border-t px-2.5 py-1.5 text-left"
        >
          <span className="bg-muted/40 text-muted-foreground min-w-[46px] shrink-0 rounded-sm border px-1 py-px text-center font-mono text-[8.5px] font-bold tracking-wide uppercase">
            {typeLabel(observation.type)}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs"
            title={observation.name ?? observation.id}
          >
            {observation.name ?? observation.id}
          </span>
          {observation.latency !== null && observation.type !== "EVENT" ? (
            <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
              {formatIntervalSeconds(observation.latency)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
};

const TurnCard = React.memo(
  ({
    trace,
    index,
    isActive,
    isCollapsed,
    onToggleCollapse,
    onSelect,
    onOpenPeek,
    projectId,
    sessionId,
    filterState,
    typeFilter,
    search,
  }: {
    trace: EventSessionTrace;
    index: number;
    isActive: boolean;
    isCollapsed: boolean;
    onToggleCollapse: (traceId: string) => void;
    onSelect: (index: number) => void;
    onOpenPeek: (trace: EventSessionTrace) => void;
    projectId: string;
    sessionId: string;
    filterState: FilterState;
    typeFilter: Set<string>;
    search: string;
  }) => {
    const openInspector = useSessionDetailStore(
      (state) => state.actions.openInspector,
    );
    return (
      <div
        className={cn(
          "bg-background group mb-2 overflow-hidden rounded-sm border",
          isActive && "ring-primary/60 border-primary/60 ring-1",
        )}
        data-observation-list-active={isActive}
      >
        <button
          type="button"
          onClick={() => {
            onSelect(index);
            // Card click also opens the trace/turn inspector (trace identity,
            // metrics, and scores that the minimal cards no longer show).
            openInspector({ traceId: trace.id, observationId: null });
          }}
          className={cn(
            "flex w-full items-center gap-2 px-2.5 py-2 text-left",
            isActive && "bg-primary/5",
          )}
          aria-current={isActive ? "true" : undefined}
        >
          <span
            className={cn(
              "shrink-0 rounded-sm border px-1.5 py-px font-mono text-[9px] font-bold",
              isActive
                ? "border-primary/50 bg-primary/10 text-primary"
                : "bg-muted/50 text-muted-foreground",
            )}
          >
            {index + 1}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs font-bold"
            title={trace.name ?? "Trace"}
          >
            {trace.name ?? "Trace"}
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label="Open trace view"
            title="Open trace view"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPeek(trace);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onOpenPeek(trace);
              }
            }}
            className="hover:bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ExternalLink className="h-3 w-3" />
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label={isCollapsed ? "Expand turn" : "Collapse turn"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse(trace.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse(trace.id);
              }
            }}
            className="hover:bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
          >
            <ChevronDown
              className={cn(
                "text-muted-foreground h-3.5 w-3.5 transition-transform",
                isCollapsed ? "-rotate-90" : "rotate-0",
              )}
            />
          </span>
        </button>
        {!isCollapsed ? (
          <TurnObservationRows
            trace={trace}
            projectId={projectId}
            sessionId={sessionId}
            filterState={filterState}
            typeFilter={typeFilter}
            search={search}
            onSelectTurn={() => onSelect(index)}
          />
        ) : null}
      </div>
    );
  },
);
TurnCard.displayName = "TurnCard";

/**
 * COL 2 of the session-detail redesign: grouped, collapsible turn cards on a
 * recessed track, with a span search box and a funnel type-filter. Clicking a
 * card header or an observation row scrolls the conversation to that turn
 * (it never opens the inspector — that happens from the conversation/feed).
 */
export function ObservationList({
  traces,
  projectId,
  sessionId,
  filterState,
  activeTraceId,
  onSelect,
  onOpenPeek,
  isOpen,
  onToggleOpen,
}: {
  traces: EventSessionTrace[];
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  activeTraceId: string | undefined;
  onSelect: (index: number) => void;
  onOpenPeek: (trace: EventSessionTrace) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [collapsedTurns, setCollapsedTurns] = useState<Record<string, true>>(
    {},
  );
  const utils = api.useUtils();

  const totalSpanCount = useMemo(
    () => traces.reduce((sum, trace) => sum + (trace.observationCount ?? 0), 0),
    [traces],
  );

  // Types offered by the funnel: the base set plus any extra types present in
  // already-loaded observation pages (scanned from the query cache on render).
  const filterTypes = useMemo(() => {
    const present = new Set(BASE_FILTER_TYPES);
    for (const trace of traces) {
      const cached = asObservationArray(
        utils.sessions.observationsForTraceFromEvents.getData({
          projectId,
          sessionId,
          traceId: trace.id,
          filter: filterState,
        }),
      );
      cached?.forEach((observation) => present.add(observation.type));
    }
    return Array.from(present);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces, projectId, sessionId, filterState, typeFilter, search]);

  const toggleCollapse = (traceId: string) =>
    setCollapsedTurns((current) => {
      const next = { ...current };
      if (next[traceId]) delete next[traceId];
      else next[traceId] = true;
      return next;
    });

  const toggleType = (type: string) =>
    setTypeFilter((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 160,
    overscan: OBSERVATION_LIST_OVERSCAN,
    getItemKey: (index) => traces[index]?.id ?? index,
  });

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label="Expand span list"
        className="bg-muted/30 hover:bg-muted/60 flex min-h-0 items-center gap-2.5 border-r px-3 lg:flex-col lg:px-0 lg:pt-3"
      >
        <ChevronsRight className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.1em] uppercase lg:[writing-mode:vertical-rl]">
          Spans · {totalSpanCount}
        </span>
      </button>
    );
  }

  return (
    <div
      role="complementary"
      aria-label="Session spans"
      className="bg-background flex min-h-0 flex-col border-r"
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b p-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search spans…"
          className="h-7 flex-1 text-xs"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Filter by span type"
              className={cn(
                typeFilter.size > 0 &&
                  "border-primary/50 bg-primary/10 text-primary",
              )}
            >
              <Funnel
                className="h-3.5 w-3.5"
                fill={typeFilter.size > 0 ? "currentColor" : "none"}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.08em] uppercase">
              Filter by type
            </DropdownMenuLabel>
            {filterTypes.map((type) => (
              <DropdownMenuCheckboxItem
                key={type}
                checked={typeFilter.has(type)}
                onCheckedChange={() => toggleType(type)}
                onSelect={(event) => event.preventDefault()}
              >
                <span className="font-mono text-[10px] font-bold tracking-wide uppercase">
                  {typeLabel(type)}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="icon-xs"
          aria-label="Collapse span list"
          onClick={onToggleOpen}
          className="hidden lg:inline-flex"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.08em] uppercase">
          All spans
        </span>
        <span className="text-muted-foreground font-mono text-[10px]">
          {totalSpanCount}
        </span>
      </div>
      <div
        ref={listRef}
        className="bg-muted/40 min-h-0 flex-1 overflow-y-auto p-2"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const trace = traces[virtualItem.index];
            if (!trace) return null;
            const isCollapsed = Boolean(collapsedTurns[trace.id]);
            return (
              <SessionVirtualizedRow
                key={virtualItem.key}
                itemKey={String(virtualItem.key)}
                measurementKey={`${String(virtualItem.key)}:${isCollapsed}:${typeFilter.size}:${search}`}
                source="modern"
                virtualItem={virtualItem}
                virtualizer={virtualizer}
              >
                <TurnCard
                  trace={trace}
                  index={virtualItem.index}
                  isActive={trace.id === activeTraceId}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={toggleCollapse}
                  onSelect={onSelect}
                  onOpenPeek={onOpenPeek}
                  projectId={projectId}
                  sessionId={sessionId}
                  filterState={filterState}
                  typeFilter={typeFilter}
                  search={search}
                />
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
