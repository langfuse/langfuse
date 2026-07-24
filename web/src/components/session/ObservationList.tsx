import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Funnel,
  Search,
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
import {
  computeIdleGapSeconds,
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/components/session/sessionIdleGap";
import { observationTypeIcon } from "@/src/components/session/sessionTypeIcons";
import {
  computeTurnLatencyPercentiles,
  type TurnLatencyPercentile,
} from "@/src/components/session/sessionPercentiles";
import { api, type RouterOutputs } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";

const OBSERVATION_LIST_OVERSCAN = 5;

/** Short type labels for the funnel filter, per the session-detail design. */
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
  const openInspector = useSessionDetailStore(
    (state) => state.actions.openInspector,
  );
  const inspectedObservationId = useSessionDetailStore(
    (state) => state.inspectedObservation?.observationId ?? null,
  );
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
      <div className="flex flex-col gap-1 py-2 pl-[17px]">
        <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-muted-foreground py-2 pl-[17px] text-xs">
        {search || typeFilter.size > 0
          ? "No matching spans"
          : "No observations"}
      </p>
    );
  }

  return (
    <div className="mt-[7px] ml-[17px] flex flex-col gap-1">
      {rows.map((observation) => {
        const { Icon, className: iconClassName } = observationTypeIcon(
          observation.type,
        );
        const isInspected = observation.id === inspectedObservationId;
        return (
          <button
            key={observation.id}
            type="button"
            onClick={() => {
              // Scroll the conversation to the turn AND open the inspector
              // on this span (rail row clicks are span-level, per design).
              onSelectTurn();
              openInspector({
                traceId: trace.id,
                observationId: observation.id,
              });
            }}
            className={cn(
              "hover:bg-muted flex w-full items-center gap-1.5 rounded-sm px-1 py-[3px] text-left transition-colors duration-150",
              isInspected && "bg-session-generation/10",
            )}
          >
            <Icon
              className={cn("h-[13px] w-[13px] shrink-0", iconClassName)}
              strokeWidth={2}
            />
            <span
              className="text-foreground min-w-0 flex-1 truncate text-xs"
              title={observation.name ?? observation.id}
            >
              {observation.name ?? observation.id}
            </span>
            {observation.latency !== null && observation.type !== "EVENT" ? (
              <span className="text-muted-foreground shrink-0 font-mono text-[10.5px]">
                {formatIntervalSeconds(observation.latency)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

/**
 * `exact seconds · tokens · cost` tooltip of a turn row — REAL trace data
 * only; parts without a datum are omitted (never fabricated).
 */
const turnMetricsTooltip = (trace: EventSessionTrace): string | undefined => {
  const parts: string[] = [];
  if (trace.latencyMs !== null && trace.latencyMs > 0)
    parts.push(`${(trace.latencyMs / 1000).toFixed(2)}s`);
  if (trace.totalUsage !== null)
    parts.push(`${trace.totalUsage.toLocaleString("en-US")} tok`);
  if (trace.totalCost !== null) parts.push(`$${trace.totalCost.toFixed(4)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
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
    percentile,
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
    /** Session-relative latency rank (null = no latency datum). */
    percentile: TurnLatencyPercentile | null;
  }) => {
    const openInspector = useSessionDetailStore(
      (state) => state.actions.openInspector,
    );
    return (
      <div
        className={cn(
          "group mb-[5px] rounded-sm border border-transparent px-2 pt-[7px] pb-2 transition-colors duration-150",
          "hover:border-border",
          isActive && "bg-primary/5",
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
          title={turnMetricsTooltip(trace)}
          className="flex w-full items-center gap-[7px] text-left"
          aria-current={isActive ? "true" : undefined}
        >
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
            className="text-muted-foreground flex h-3.5 w-3.5 shrink-0 items-center justify-center"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-150",
                isCollapsed ? "-rotate-90" : "rotate-0",
              )}
              strokeWidth={1.6}
            />
          </span>
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm font-mono text-[9.5px]",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {index + 1}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[12.5px] font-bold"
            title={trace.name ?? "Trace"}
          >
            {trace.name ?? "Trace"}
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label="Open Trace View"
            title="Open Trace View"
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
          {/* Session-relative latency percentile (real latencies only);
              amber at/above p90. Exact metrics live in the row tooltip. */}
          {percentile ? (
            <span
              className={cn(
                "shrink-0 font-mono text-[11px]",
                percentile.isSlow
                  ? "text-dark-yellow"
                  : "text-muted-foreground",
              )}
            >
              {percentile.label}
            </span>
          ) : null}
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

/** Mono uppercase eyebrow used by the rail's header and sub-rows. */
const RailEyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase">
    {children}
  </span>
);

/**
 * COL 2 of the session-detail redesign, in the v4 visual language: a header
 * band (`SPANS … N`), span search + funnel type-filter, a `GROUPED BY
 * CHAT-TURN` sub-row, and flat turn cards (square turn-number badge, hover
 * hairline, expandable typed children rows) with idle separators between
 * turns that are ≥5 minutes apart. Clicking a card header scrolls the
 * conversation to that turn and opens the trace inspector; clicking a child
 * row scrolls to the turn and opens the inspector on that span.
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

  // Idle gap before each turn (index 0 has none), for the rail separators.
  const idleGapSeconds = useMemo(
    () =>
      traces.map((trace, index) =>
        index === 0 ? null : computeIdleGapSeconds(traces[index - 1], trace),
      ),
    [traces],
  );

  // Session-relative latency percentile per turn, from REAL trace latencies.
  const percentiles = useMemo(
    () =>
      computeTurnLatencyPercentiles(
        traces.map((trace) =>
          trace.latencyMs !== null && trace.latencyMs > 0
            ? trace.latencyMs
            : null,
        ),
      ),
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
        className="hover:bg-muted relative flex min-h-0 items-center gap-2.5 rounded-sm px-3 transition-colors duration-150 lg:flex-col lg:px-0 lg:pt-3"
      >
        <ChevronsRight className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.05em] uppercase lg:[writing-mode:vertical-rl]">
          Spans · {totalSpanCount}
        </span>
      </button>
    );
  }

  return (
    <div
      role="complementary"
      aria-label="Session spans"
      className="relative flex min-h-0 flex-col"
    >
      <div className="border-border-contrast flex shrink-0 items-center justify-between border-b border-dashed px-3 py-[7px]">
        <RailEyebrow>
          Traces{" "}
          <span className="text-foreground-tertiary">· {traces.length}</span>
        </RailEyebrow>
        <span
          className="text-muted-foreground font-mono text-[10px]"
          title={`${totalSpanCount} spans`}
        >
          {totalSpanCount} spans
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-2.5 pb-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-foreground-tertiary absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2"
            strokeWidth={1.6}
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search spans"
            className="bg-background h-[30px] rounded-sm pl-7 text-[13px]"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Filter by span type"
              className={cn(
                "h-[30px] w-[30px] rounded-sm",
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
          className="hidden h-[30px] w-[30px] rounded-sm lg:inline-flex"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center justify-between px-3 pb-1.5">
        <RailEyebrow>Grouped by chat-turn</RailEyebrow>
        <span className="text-muted-foreground font-mono text-[10px]">
          ↑↓ · j/k to move
        </span>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
            const gap = idleGapSeconds[virtualItem.index];
            return (
              <SessionVirtualizedRow
                key={virtualItem.key}
                itemKey={String(virtualItem.key)}
                measurementKey={`${String(virtualItem.key)}:${isCollapsed}:${typeFilter.size}:${search}`}
                source="modern"
                virtualItem={virtualItem}
                virtualizer={virtualizer}
              >
                {gap !== null &&
                gap !== undefined &&
                gap >= IDLE_GAP_THRESHOLD_SECONDS ? (
                  // Idle band: subtle cross-hatch fill (handoff v3), drawn
                  // from the theme's foreground so both modes stay defined.
                  <div className="mx-0.5 mb-[5px] flex items-center rounded-sm bg-[repeating-linear-gradient(315deg,hsl(var(--foreground)/0.07)_0_1px,transparent_1px_5px)] px-2 py-[5px]">
                    <span className="text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                      +{formatIdleGap(gap)} idle
                    </span>
                  </div>
                ) : null}
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
                  percentile={percentiles[virtualItem.index] ?? null}
                />
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
