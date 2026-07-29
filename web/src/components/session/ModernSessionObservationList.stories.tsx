import preview from "../../../.storybook/preview";
import { fn } from "storybook/test";
import { type ComponentProps } from "react";

import { ModernSessionObservationList } from "@/src/components/session/ModernSessionObservationList";
import {
  ObservationListRows,
  type ObservationListRowsRenderer,
} from "@/src/components/session/ObservationListRows";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";

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

const renderObservationRows: ObservationListRowsRenderer = ({
  traceId,
  search,
  onSelectTurn,
}) => {
  const normalizedSearch = search.trim().toLowerCase();
  const rows = (observationsByTraceId[traceId] ?? []).filter(
    (observation) =>
      normalizedSearch === "" ||
      observation.name.toLowerCase().includes(normalizedSearch),
  );

  if (rows.length === 0) {
    return (
      <ObservationListRows
        state={{
          type: "empty",
          hasFilters: normalizedSearch !== "",
        }}
      />
    );
  }

  return (
    <ObservationListRows
      state={{ type: "loaded", rows }}
      onSelectTurn={onSelectTurn}
    />
  );
};

const loadedArgs = {
  state: "loaded",
  traces,
  activeTraceId: "turn-2",
  selectedTraceId: undefined,
  filterControls: {
    activeFilterCount: 0,
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
  renderObservationRows,
  onSelect: fn(),
} satisfies Extract<
  ComponentProps<typeof ModernSessionObservationList>,
  { state: "loaded" }
>;

const meta = preview.meta({
  component: ModernSessionObservationList,
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="bg-background h-screen w-[296px]">
      <ModernSessionObservationList {...args} />
    </div>
  ),
});

export default meta;

export const Default = meta.story({ args: loadedArgs });

export const SelectedTurn = meta.story({
  args: {
    ...loadedArgs,
    selectedTraceId: "turn-2",
  },
});

export const ActiveFilters = meta.story({
  args: {
    ...loadedArgs,
    filterControls: {
      ...loadedArgs.filterControls,
      activeFilterCount: 2,
    },
  },
});

export const ActiveView = meta.story({
  args: {
    ...loadedArgs,
    filterControls: {
      ...loadedArgs.filterControls,
      activeFilterCount: 2,
      activeViewName: "All observations with I/O",
      selectedViewId: "__langfuse_with_io__",
      matchingSystemPresetId: "__langfuse_with_io__",
    },
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
    renderObservationRows: () => (
      <ObservationListRows state={{ type: "loading" }} />
    ),
  },
});
