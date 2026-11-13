import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import { DEFAULT_TOPIC_FACETS, type TopicFacet } from "@langfuse/shared/topics";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { NewAnalysisDialogView } from "./NewAnalysisDialogView";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";
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
].map(([name, timestamp], index) => ({
  id: `trace-${index}`,
  name: name!,
  timestamp: new Date(timestamp!),
  environment: "default",
}));

const tracePreview: TopicTracePreview = {
  status: "ready",
  count: 412,
  traces,
};

type Counts = {
  matchedTraceCount: number;
  summarizedCount: number;
  minimumTraceCount: number;
  ready: boolean;
};

const enoughTraces: Counts = {
  matchedTraceCount: 412,
  summarizedCount: 388,
  minimumTraceCount: 50,
  ready: true,
};

function NewScanStory({
  counts = enoughTraces,
  initialFacetIds = facets.map(({ id }) => id),
  starting = false,
  errors = [],
  liveDisabledReason,
  initialLive = !liveDisabledReason,
}: {
  counts?: Counts | null;
  initialFacetIds?: string[];
  starting?: boolean;
  errors?: string[];
  initialLive?: boolean;
  liveDisabledReason?: string;
}) {
  const [name, setName] = useState("All generations");
  const [filter, setFilter] = useState(generations);
  const [facetIds, setFacetIds] = useState(initialFacetIds);
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
  const [live, setLive] = useState(initialLive);
  const [samplingPercent, setSamplingPercent] = useState(25);
  return (
    <NewAnalysisDialogView
      name={name}
      onNameChange={setName}
      filterField={
        <TopicTraceFilterSection
          projectId="demo-project"
          filters={filter}
          onFiltersChange={setFilter}
          model={{
            ...traceFilterState,
            mode,
            observed: {},
            builderColumns: [...topicsFilterRegistry.columns],
            preview: tracePreview,
          }}
        />
      }
      facets={facets}
      facetIds={facetIds}
      onFacetIdsChange={setFacetIds}
      live={live}
      onLiveChange={setLive}
      liveDisabledReason={liveDisabledReason}
      samplingField={
        <TopicSliceFields.Sampling
          value={samplingPercent}
          onChange={setSamplingPercent}
          dailyTraces={1_240}
          tooltip="Share of new matching traces this scan analyzes."
        />
      }
      preview={counts}
      canStart={Boolean(counts?.ready) && facetIds.length > 0}
      starting={starting}
      errors={errors}
      onStart={fn()}
    />
  );
}

const meta = preview.meta({
  component: NewScanStory,
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

export const Live = meta.story({ name: "Live scan" });

export const OneOff = meta.story({
  name: "One-off scan",
  args: { initialLive: false },
});

export const Counting = meta.story({
  args: { counts: null, initialLive: false },
});

export const LiveLimitReached = meta.story({
  name: "Live scan limit reached",
  args: { liveDisabledReason: "A project can have at most 5 live scans." },
});

export const NotEnoughTraces = meta.story({
  name: "Not enough summarized traces",
  args: {
    counts: {
      matchedTraceCount: 22,
      summarizedCount: 16,
      minimumTraceCount: 50,
      ready: false,
    },
    initialLive: false,
  },
});

export const Starting = meta.story({ args: { starting: true } });

export const StartFailed = meta.story({
  name: "Start failed",
  args: { errors: ["Couldn’t start the scan. Try again."] },
});

export const NothingToLookFor = meta.story({
  name: "(Test) Start stays disabled without anything to look for",
  args: { initialFacetIds: [] },
  play: async () => {
    const body = within(document.body);
    const start = await body.findByRole("button", { name: "Start live scan" });
    await expect(start).toBeDisabled();
    await userEvent.click(body.getByRole("checkbox", { name: "Intent" }));
    await expect(start).toBeEnabled();
  },
});

export const OnlyLiveOperators = meta.story({
  name: "(Test) The filter builder offers only operators live scans support",
  play: async () => {
    const body = within(document.body);
    // The story's filter is `type any of GENERATION`; `none of` can't be saved.
    const operator = (await body.findAllByRole("combobox")).find(
      (element) => element.textContent === "any of",
    );
    await userEvent.click(operator!);
    const options = await body.findAllByRole("option");
    await expect(options.map((option) => option.textContent)).toEqual([
      "any of",
    ]);
  },
});
