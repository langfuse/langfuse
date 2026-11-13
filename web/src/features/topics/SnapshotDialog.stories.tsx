import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import {
  DEFAULT_TOPIC_FACETS,
  TOPICS_ANALYSIS_MIN_TRACES,
  TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES,
  type TopicFacet,
} from "@langfuse/shared/topics";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  SNAPSHOT_DEFAULT_SUMMARIZE,
  SnapshotDialogView,
  snapshotSummarizeCount,
  type SnapshotSummarize,
} from "./SnapshotDialogView";
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

const traces = [
  ["support-copilot", "2026-11-12T05:48:00Z"],
  ["refund-agent", "2026-11-11T05:30:00Z"],
  ["support-copilot", "2026-11-08T19:06:00Z"],
].map(([name, timestamp], index) => ({
  id: `trace-${index}`,
  name: name!,
  timestamp: new Date(timestamp!),
  environment: "default",
}));

type Counts = {
  summarizedCount: number;
  unsummarizedCount: number | null;
};

function SnapshotStory({
  counts = { summarizedCount: 1_284, unsummarizedCount: 3_410 },
  initialName = "",
  initialSummarize = SNAPSHOT_DEFAULT_SUMMARIZE,
  errors = [],
}: {
  counts?: Counts | null;
  initialName?: string;
  initialSummarize?: SnapshotSummarize;
  errors?: string[];
}) {
  const [name, setName] = useState(initialName);
  // Filters always start empty; nothing is carried over from the open map.
  const [filter, setFilter] = useState<FilterState>([]);
  const [facetIds, setFacetIds] = useState(facets.map(({ id }) => id));
  const [windowDays, setWindowDays] = useState(7);
  const [summarize, setSummarize] = useState(initialSummarize);
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
  // The fixture scales with the window, as the real counts do.
  const scale = windowDays / 7;
  const shown = counts && {
    summarizedCount: Math.round(counts.summarizedCount * scale),
    unsummarizedCount:
      counts.unsummarizedCount === null
        ? null
        : Math.round(counts.unsummarizedCount * scale),
    minimumTraceCount: TOPICS_ANALYSIS_MIN_TRACES,
    smallSampleMinimumTraceCount: TOPICS_ANALYSIS_SMALL_SAMPLE_MIN_TRACES,
  };
  const tracePreview: TopicTracePreview = shown
    ? {
        status: "ready",
        count: shown.summarizedCount + (shown.unsummarizedCount ?? 0),
        traces,
      }
    : { status: "loading" };
  const extra = snapshotSummarizeCount(summarize, shown);
  return (
    <SnapshotDialogView
      name={name}
      onNameChange={setName}
      filterField={
        <TopicTraceFilterSection
          projectId="demo-project"
          filters={filter}
          onFiltersChange={setFilter}
          kind="snapshot"
          days={windowDays}
          onDaysChange={setWindowDays}
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
      preview={shown}
      summarize={summarize}
      onSummarizeChange={setSummarize}
      canStart={
        name.trim().length > 0 &&
        Boolean(shown) &&
        facetIds.length > 0 &&
        shown!.summarizedCount + extra >= shown!.smallSampleMinimumTraceCount
      }
      starting={false}
      errors={errors}
      onStart={fn()}
    />
  );
}

const meta = preview.meta({
  component: SnapshotStory,
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

export const Default = meta.story({ name: "New snapshot" });

export const Summarizing = meta.story({
  name: "Summarizing 1,000 more, latest first",
  args: {
    initialName: "Billing questions",
    initialSummarize: { enabled: true, count: 1_000, selection: "latest" },
  },
});

export const FewSummaries = meta.story({
  name: "Few summaries turns summarizing on",
  args: { counts: { summarizedCount: 42, unsummarizedCount: 880 } },
});

export const NothingToSummarize = meta.story({
  name: "Every matching trace summarized",
  args: { counts: { summarizedCount: 640, unsummarizedCount: 0 } },
});

export const TooFewTraces = meta.story({
  name: "Too few traces to start",
  args: { counts: { summarizedCount: 6, unsummarizedCount: 0 } },
});

export const Counting = meta.story({ args: { counts: null } });

export const CountUnavailable = meta.story({
  name: "Unsummarized count unavailable",
  args: { counts: { summarizedCount: 1_284, unsummarizedCount: null } },
});

export const StartFailed = meta.story({
  name: "Start failed",
  args: {
    initialName: "Billing questions",
    errors: ["Couldn’t create the snapshot. Try again."],
  },
});

export const StartRules = meta.story({
  name: "(Test) Create needs a name and starts below 100 summaries",
  args: { counts: { summarizedCount: 42, unsummarizedCount: 880 } },
  play: async () => {
    const body = within(document.body);
    const create = await body.findByRole("button", { name: "Create snapshot" });
    const toggle = body.getByRole("checkbox", {
      name: "Summarize more traces",
    });
    await expect(toggle).toBeChecked();
    const traces = body.getByRole("combobox", { name: "Traces to summarize" });
    await expect(traces).toHaveTextContent("500");
    await expect(create).toBeDisabled();
    await userEvent.type(
      body.getByRole("textbox", { name: "Snapshot name" }),
      "Billing questions",
    );
    await expect(create).toBeEnabled();
    // 42 summaries alone still start; the fit clusters them as a small sample.
    await userEvent.click(toggle);
    await expect(create).toBeEnabled();
    // Off, the count still shows what turning it on would summarize.
    await expect(traces).toHaveTextContent("500");
  },
});
