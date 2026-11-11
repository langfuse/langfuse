import { useState, type ReactNode } from "react";
import type { FilterState } from "@langfuse/shared";
import { DEFAULT_TOPIC_FACETS, type TopicFacet } from "@langfuse/shared/topics";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { NewAnalysisDialogView } from "./NewAnalysisDialogView";
import { TopicSliceFields } from "./TopicSliceFields";
import { topicsFilterRegistry } from "./useTopicTraceFilter";

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

/**
 * The real filter field queries observations over tRPC, which stories don't
 * provide; this stand-in renders its header rows from the same parts, without
 * the observations table.
 */
function FilterFieldStandIn({
  filter,
  onChange,
  matches,
  windowControl,
}: {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  matches: number | null;
  windowControl: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter traces"
          meta={null}
          description="A trace matches when one of its observations meets every filter."
          tooltip="Any tracing filter, including scores, latency, cost and negative filters."
          trailing={<FilterModeToggle mode="builder" onChange={fn()} />}
        />
        <ObservationFilterBuilder
          columns={[...topicsFilterRegistry.columns]}
          filterState={filter}
          onChange={onChange}
          queryOnlyColumnIds={[]}
        />
      </section>
      <SectionHeader
        title="Matching observations"
        meta={
          <span className="text-muted-foreground text-sm">
            {matches ?? "…"}
          </span>
        }
        description="Observations in the scan window that match the filters."
        tooltip="A trace is in the slice when one of its observations matches."
        trailing={windowControl}
      />
    </div>
  );
}

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
  initialDays = 7,
  starting = false,
  errors = [],
  initialLive = false,
  liveDisabledReason,
}: {
  counts?: Counts | null;
  initialFacetIds?: string[];
  initialDays?: number;
  starting?: boolean;
  errors?: string[];
  initialLive?: boolean;
  liveDisabledReason?: string;
}) {
  const [name, setName] = useState("All generations");
  const [filter, setFilter] = useState(generations);
  const [facetIds, setFacetIds] = useState(initialFacetIds);
  const [days, setDays] = useState(initialDays);
  const [live, setLive] = useState(initialLive);
  const [samplingPercent, setSamplingPercent] = useState(25);
  return (
    <NewAnalysisDialogView
      name={name}
      onNameChange={setName}
      filterField={
        <FilterFieldStandIn
          filter={filter}
          onChange={setFilter}
          matches={counts ? counts.matchedTraceCount : null}
          windowControl={
            <TopicSliceFields.Window
              days={[7, 30]}
              value={days}
              onChange={setDays}
            />
          }
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

export const Ready = meta.story({});

export const ThirtyDays = meta.story({
  name: "30-day window",
  args: {
    initialDays: 30,
    counts: {
      matchedTraceCount: 14_210,
      summarizedCount: 9_860,
      minimumTraceCount: 50,
      ready: true,
    },
  },
});

export const Counting = meta.story({ args: { counts: null } });

export const Live = meta.story({
  name: "Live scan",
  args: { initialLive: true },
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
    const start = await body.findByRole("button", { name: "Start scan" });
    await expect(start).toBeDisabled();
    await userEvent.click(body.getByRole("checkbox", { name: "Intent" }));
    await expect(start).toBeEnabled();
  },
});
