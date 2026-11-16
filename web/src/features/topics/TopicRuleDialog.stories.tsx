import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import {
  DEFAULT_TOPIC_FACETS,
  topicRuleFilterError,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { TopicRuleDialogView } from "./TopicRuleDialogView";
import {
  topicsFilterRegistry,
  useTopicTraceFilterState,
  type TopicTracePreview,
} from "./useTopicTraceFilter";

const facets: TopicFacet[] = DEFAULT_TOPIC_FACETS.map((facet) => ({
  id: facet.name.toLowerCase(),
  projectId: "demo-project",
  name: facet.name,
  description: facet.description,
  isBuiltIn: true,
  versions: [],
}));

const generations: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
];

const traces = [
  ["draft-reply", "2026-11-09T05:48:00Z"],
  ["extract-entities", "2026-11-09T05:30:00Z"],
  ["support-copilot", "2026-11-05T19:06:00Z"],
  ["chain.refine", "2026-11-05T07:00:00Z"],
].map(([name, timestamp], index) => ({
  id: `trace-${index}`,
  name: name!,
  timestamp: new Date(timestamp!),
  environment: "default",
}));

const readyPreview: TopicTracePreview = {
  status: "ready",
  count: traces.length,
  traces,
};

type StoryProps = {
  initialFilter?: FilterState;
  initialFacetIds?: string[];
  initialPaused?: boolean;
  initialSamplingPercent?: number;
  name?: string;
  tracePreview?: TopicTracePreview;
  dailyTraces?: number | null;
  saving?: boolean;
  saveError?: string | null;
};

function EditScanStory({
  initialFilter = generations,
  initialFacetIds = facets.map(({ id }) => id),
  initialPaused = false,
  initialSamplingPercent = 100,
  name: initialName = "All generations",
  tracePreview = readyPreview,
  dailyTraces = 1,
  saving = false,
  saveError = null,
}: StoryProps) {
  const [name, setName] = useState(initialName);
  const [filter, setFilter] = useState(initialFilter);
  const [facetIds, setFacetIds] = useState(initialFacetIds);
  const [paused, setPaused] = useState(initialPaused);
  const [samplingPercent, setSamplingPercent] = useState(
    initialSamplingPercent,
  );
  // The query editor's Ask AI needs tRPC, which stories don't provide.
  const [mode, setMode] = useState<EvaluatorFilterExperience>("builder");
  const traceFilterState = useTopicTraceFilterState({
    projectId: "demo-project",
    filters: filter,
    onFiltersChange: setFilter,
    observed: {},
    mode,
    onModeChange: setMode,
  });
  return (
    <TopicRuleDialogView
      projectId="demo-project"
      facets={facets}
      name={name}
      onNameChange={setName}
      filter={filter}
      onFilterChange={setFilter}
      traceFilter={{
        ...traceFilterState,
        mode,
        observed: {},
        builderColumns: [...topicsFilterRegistry.columns],
        preview: tracePreview,
      }}
      filterError={topicRuleFilterError(filter)}
      facetIds={facetIds}
      onFacetIdsChange={setFacetIds}
      paused={paused}
      onPausedChange={setPaused}
      samplingPercent={samplingPercent}
      onSamplingPercentChange={setSamplingPercent}
      dailyTraces={dailyTraces}
      canSave={traceFilterState.ready && facetIds.length > 0}
      saving={saving}
      saveError={saveError}
      onSave={fn()}
    />
  );
}

const meta = preview.meta({
  component: EditScanStory,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

export const Live = meta.story({});

export const Sampled = meta.story({
  name: "Sampled, high traffic",
  args: {
    initialSamplingPercent: 25,
    dailyTraces: 1840,
    tracePreview: { ...readyPreview, count: 12_880 },
  },
});

export const Paused = meta.story({ args: { initialPaused: true } });

export const AllTraces = meta.story({
  name: "No filter",
  args: { initialFilter: [], name: "All traces" },
});

export const PreviewLoading = meta.story({
  name: "Preview loading",
  args: { tracePreview: { status: "loading" }, dailyTraces: null },
});

export const NoMatches = meta.story({
  name: "No matching traces",
  args: {
    tracePreview: { status: "ready", count: 0, traces: [] },
    dailyTraces: 0,
  },
});

export const PreviewError = meta.story({
  name: "Preview failed",
  args: {
    tracePreview: { status: "error", message: "Couldn’t load traces." },
    dailyTraces: null,
  },
});

export const Saving = meta.story({ args: { saving: true } });

export const SaveError = meta.story({
  name: "Save failed",
  args: { saveError: "A project can have at most 5 Topics rules." },
});

export const NothingToLookFor = meta.story({
  name: "(Test) Save stays disabled without anything to look for",
  args: { initialFacetIds: [] },
  play: async () => {
    const body = within(document.body);
    const save = await body.findByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await userEvent.click(body.getByRole("checkbox", { name: "Intent" }));
    await expect(save).toBeEnabled();
  },
});

export const PauseHidesSample = meta.story({
  name: "(Test) Turning off live updates pauses the map and hides the sample rate",
  play: async () => {
    const body = within(document.body);
    await body.findByRole("spinbutton", { name: "Sampling rate percent" });
    await userEvent.click(body.getByRole("switch", { name: "Live updates" }));
    await expect(
      body.queryByRole("spinbutton", { name: "Sampling rate percent" }),
    ).toBeNull();
    await expect(body.queryByText("LIVE")).toBeNull();
    await expect(body.getByText("PAUSED")).toBeInTheDocument();
  },
});
