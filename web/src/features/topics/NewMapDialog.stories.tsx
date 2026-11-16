import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import { DEFAULT_TOPIC_FACETS, type TopicFacet } from "@langfuse/shared/topics";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { NewMapDialogView } from "./NewMapDialogView";
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

function NewMapStory({
  initialName = "",
  initialFilter = [],
  initialFacetIds = facets.map(({ id }) => id),
  errors = [],
  disabledReason,
}: {
  initialName?: string;
  initialFilter?: FilterState;
  initialFacetIds?: string[];
  errors?: string[];
  disabledReason?: string;
}) {
  const [name, setName] = useState(initialName);
  // Filters always start empty; nothing is carried over from the open map.
  const [filter, setFilter] = useState(initialFilter);
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
  const [samplingPercent, setSamplingPercent] = useState(25);
  return (
    <NewMapDialogView
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
      disabledReason={disabledReason}
      samplingField={
        <TopicSliceFields.Sampling
          value={samplingPercent}
          onChange={setSamplingPercent}
          dailyTraces={1_240}
          tooltip="Share of new matching traces this map analyzes."
        />
      }
      canStart={name.trim().length > 0 && facetIds.length > 0}
      starting={false}
      errors={errors}
      onStart={fn()}
    />
  );
}

const meta = preview.meta({
  component: NewMapStory,
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

export const Default = meta.story({ name: "New map" });

export const LimitReached = meta.story({
  name: "Map limit reached",
  args: { disabledReason: "A project can have at most 5 maps." },
});

export const StartFailed = meta.story({
  name: "Start failed",
  args: {
    initialName: "Support agent",
    errors: ["Couldn’t create the map. Try again."],
  },
});

export const NothingToLookFor = meta.story({
  name: "(Test) Create needs a name and something to look for",
  args: { initialFacetIds: [] },
  play: async () => {
    const body = within(document.body);
    const start = await body.findByRole("button", {
      name: "Create map",
    });
    await userEvent.type(
      body.getByRole("textbox", { name: "Map name" }),
      "Support agent",
    );
    await expect(start).toBeDisabled();
    await userEvent.click(body.getByRole("checkbox", { name: "Intent" }));
    await expect(start).toBeEnabled();
  },
});

export const OnlyLiveOperators = meta.story({
  name: "(Test) The filter builder offers only operators maps support",
  args: { initialFilter: generations },
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
