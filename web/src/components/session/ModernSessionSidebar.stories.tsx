import preview from "../../../.storybook/preview";
import { fn } from "storybook/test";
import { type ComponentProps, useState } from "react";

import {
  ModernSessionSidebar,
  type ModernSessionSidebarTrace,
} from "@/src/components/session/ModernSessionSidebar";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type FilterState } from "@langfuse/shared";

const traces = [
  {
    id: "turn-1",
    name: "Answer product question",
    timestamp: new Date("2026-01-01T12:00:00.000Z"),
    environment: "production",
    userId: "user-1",
    observationCount: 2,
    latencyMs: 60_000,
    scores: [],
  },
  {
    id: "turn-2",
    name: "Resolve follow-up",
    timestamp: new Date("2026-01-01T12:02:00.000Z"),
    environment: "production",
    userId: "user-1",
    observationCount: 2,
    latencyMs: 60_000,
    scores: [],
  },
  {
    id: "turn-3",
    name: "Summarize findings",
    timestamp: new Date("2026-01-01T12:08:00.000Z"),
    environment: "production",
    userId: "user-1",
    observationCount: 1,
    latencyMs: 30_000,
    scores: [],
  },
] satisfies EventSessionTrace[];

const observationsByTraceId: Record<
  string,
  Array<{ id: string; name: string; type: string; latency: number | null }>
> = {
  "turn-1": [
    {
      id: "span-1",
      name: "Retrieve documentation",
      type: "SPAN",
      latency: 0.42,
    },
    {
      id: "generation-1",
      name: "Compose response",
      type: "GENERATION",
      latency: 1.8,
    },
  ],
  "turn-2": [
    { id: "tool-1", name: "Search knowledge base", type: "TOOL", latency: 0.7 },
    {
      id: "generation-2",
      name: "Write follow-up",
      type: "GENERATION",
      latency: 1.2,
    },
  ],
  "turn-3": [
    {
      id: "event-1",
      name: "Conversation closed",
      type: "EVENT",
      latency: null,
    },
  ],
};

const LARGE_SESSION_TURN_COUNT = 200;
const largeSessionTurnTopics = [
  "Troubleshoot API timeout",
  "Compare model performance",
  "Explain usage costs",
  "Debug missing traces",
  "Configure prompt versioning",
  "Review evaluation results",
  "Investigate ingestion delay",
  "Set up dataset testing",
];
const largeSessionData = Array.from(
  { length: LARGE_SESSION_TURN_COUNT },
  (_, index) => {
    const turnNumber = index + 1;
    const traceId = `large-turn-${turnNumber}`;
    const observations = [
      {
        id: `${traceId}-receive-message`,
        name: "Receive user message",
        type: "EVENT",
        latency: 0.01,
      },
      {
        id: `${traceId}-load-history`,
        name: "Load conversation history",
        type: "SPAN",
        latency: 0.08,
      },
      ...(turnNumber % 2 === 0
        ? [
            {
              id: `${traceId}-search-docs`,
              name: "Search product documentation",
              type: "TOOL",
              latency: 0.42,
            },
          ]
        : []),
      ...(turnNumber % 5 === 0
        ? [
            {
              id: `${traceId}-fetch-account`,
              name: "Fetch account context",
              type: "TOOL",
              latency: 0.27,
            },
          ]
        : []),
      {
        id: `${traceId}-generate-response`,
        name: "Generate assistant response",
        type: "GENERATION",
        latency: 0.9 + (turnNumber % 7) * 0.13,
      },
      {
        id: `${traceId}-validate-response`,
        name: "Validate response against policy",
        type: "SPAN",
        latency: 0.06,
      },
      {
        id: `${traceId}-persist-response`,
        name: "Persist assistant message",
        type: "EVENT",
        latency: 0.02,
      },
    ];

    return {
      trace: {
        id: traceId,
        name:
          largeSessionTurnTopics[index % largeSessionTurnTopics.length] ??
          "Continue conversation",
        timestamp: new Date(
          new Date("2026-01-01T12:00:00.000Z").getTime() + index * 90_000,
        ),
        environment: "production",
        userId: "large-session-user",
        observationCount: observations.length,
        latencyMs: Math.round(
          observations.reduce(
            (total, observation) => total + observation.latency,
            0,
          ) * 1_000,
        ),
        scores: [],
      } satisfies EventSessionTrace,
      observations,
    };
  },
);
const largeSessionTraces = largeSessionData.map(({ trace }) => trace);
const largeSessionObservationsByTraceId = Object.fromEntries(
  largeSessionData.map(({ trace, observations }) => [trace.id, observations]),
);
const onExcludeObservation = fn();

const toSidebarTraces = (
  sourceTraces: EventSessionTrace[],
  observations: Record<
    string,
    Array<{ id: string; name: string; type: string; latency: number | null }>
  >,
): ModernSessionSidebarTrace[] =>
  sourceTraces.map((trace, index) => ({
    trace,
    turnNumber: index + 1,
    observations: observations[trace.id] ?? [],
  }));

const sidebarTraces = toSidebarTraces(traces, observationsByTraceId);
const largeSessionSidebarTraces = toSidebarTraces(
  largeSessionTraces,
  largeSessionObservationsByTraceId,
);

const activeFilters = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION", "SPAN"],
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
] satisfies FilterState;

const loadedArgs = {
  state: "loaded",
  traces: sidebarTraces,
  activeTraceId: "turn-2",
  filterControls: {
    activeFilterCount: 0,
    activeFilters: [],
    activeViewName: undefined,
    selectedViewId: null,
    matchingSystemPresetId: undefined,
    matchingSavedViewId: undefined,
    savedViews: [],
    onApplyPreset: fn(),
    onApplySavedView: fn(),
    onManageViews: fn(),
    onOpenFilterDialog: fn(),
    onClearFilters: fn(),
  },
  search: "",
  onSearchChange: fn(),
  expandedTraceIds: new Set(traces.map((trace) => trace.id)),
  onToggleTraceExpanded: fn(),
  onExcludeObservation,
  onSelect: fn(),
  onVisibleTraceIdsChange: fn(),
  hasMoreObservations: false,
  isLoadingMoreObservations: false,
  observationLoadError: false,
  onLoadMoreObservations: fn(),
} satisfies Extract<
  ComponentProps<typeof ModernSessionSidebar>,
  { state: "loaded" }
>;

function ModernSessionSidebarStory(
  args: ComponentProps<typeof ModernSessionSidebar>,
) {
  const [search, setSearch] = useState(
    args.state === "loaded" ? args.search : "",
  );
  const [expandedTraceIds, setExpandedTraceIds] = useState(
    args.state === "loaded" ? args.expandedTraceIds : new Set<string>(),
  );

  if (args.state === "loading") {
    return (
      <div className="h-screen w-[296px]">
        <ModernSessionSidebar state="loading" />
      </div>
    );
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleTraces = normalizedSearch
    ? args.traces.flatMap((sidebarTrace) => {
        const matchingObservations = sidebarTrace.observations?.filter(
          (observation) =>
            (observation.name ?? "").toLowerCase().includes(normalizedSearch),
        );
        const traceMatches = (sidebarTrace.trace.name ?? "")
          .toLowerCase()
          .includes(normalizedSearch);
        if (!traceMatches && matchingObservations?.length === 0) return [];
        return [{ ...sidebarTrace, observations: matchingObservations }];
      })
    : args.traces;

  return (
    <div className="h-screen w-[296px]">
      <ModernSessionSidebar
        {...args}
        traces={visibleTraces}
        search={search}
        onSearchChange={(nextSearch) => {
          setSearch(nextSearch);
          args.onSearchChange(nextSearch);
        }}
        expandedTraceIds={expandedTraceIds}
        onToggleTraceExpanded={(traceId) => {
          setExpandedTraceIds((current) => {
            const next = new Set(current);
            if (next.has(traceId)) next.delete(traceId);
            else next.add(traceId);
            return next;
          });
          args.onToggleTraceExpanded(traceId);
        }}
      />
    </div>
  );
}

const meta = preview.meta({
  component: ModernSessionSidebar,
  parameters: { layout: "fullscreen" },
  render: (args) => <ModernSessionSidebarStory {...args} />,
});

export default meta;

export const Default = meta.story({ args: loadedArgs });

export const ActiveFilters = meta.story({
  args: {
    ...loadedArgs,
    filterControls: {
      ...loadedArgs.filterControls,
      activeFilterCount: 2,
      activeFilters,
    },
  },
});

export const ActiveView = meta.story({
  args: {
    ...loadedArgs,
    filterControls: {
      ...loadedArgs.filterControls,
      activeFilterCount: 2,
      activeFilters,
      activeViewName: "All observations with I/O",
      selectedViewId: "__langfuse_with_io__",
      matchingSystemPresetId: "__langfuse_with_io__",
    },
  },
});

export const LargeSession = meta.story({
  args: {
    ...loadedArgs,
    traces: largeSessionSidebarTraces,
    activeTraceId: "large-turn-1",
    expandedTraceIds: new Set(largeSessionTraces.map((trace) => trace.id)),
  },
});

export const LoadingTurns = meta.story({
  args: {
    state: "loading",
  },
});

export const LoadingSpans = meta.story({
  args: {
    ...loadedArgs,
    traces: sidebarTraces.map((sidebarTrace) => ({
      ...sidebarTrace,
      observations: undefined,
    })),
  },
});
