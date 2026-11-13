import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import {
  topicsFilterRegistry,
  useTopicTraceFilterState,
} from "./useTopicTraceFilter";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { TopicSetupFlowDialog } from "./TopicSetupFlowDialog";
import {
  TOPIC_SETUP_QUESTIONS,
  type TopicSetupQuestion,
} from "./topic-setup-flow";

const providerGroups: Array<[string, string[]]> = [
  [
    "Amazon Bedrock",
    [
      "us.anthropic.claude-haiku-5-5",
      "us.anthropic.claude-sonnet-5-5",
      "us.cohere.embed-v4:0",
    ],
  ],
];

const questions: TopicSetupQuestion[] = TOPIC_SETUP_QUESTIONS.map(
  (question) => ({
    name: question.name,
    description:
      DEFAULT_TOPIC_FACETS.find((facet) => facet.name === question.name)
        ?.description ?? "",
    enabled: true,
  }),
);

function SetupStory({
  step,
  connection = "ready",
}: {
  step: "questions" | "traces" | "review";
  /** "none": no AI connection yet; "viewer": none, and this user cannot add one. */
  connection?: "ready" | "none" | "viewer";
}) {
  const [selected, setSelected] = useState(questions);
  const [filter, setFilter] = useState<FilterState>([]);
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
    <TopicSetupFlowDialog
      advancedOpen={false}
      busy={false}
      canWrite
      clustering={{
        provider: "Amazon Bedrock",
        model: "us.anthropic.claude-sonnet-5-5",
      }}
      connectionCaption="Amazon Bedrock"
      hasConnection={connection === "ready"}
      canAddConnection={connection !== "viewer"}
      embedding={{
        provider: "Amazon Bedrock",
        model: "us.cohere.embed-v4:0",
      }}
      embeddingProviderGroups={providerGroups}
      error={null}
      onAdvancedOpenChange={fn()}
      onBack={fn()}
      onClusteringChange={fn()}
      onConfigureProviders={fn()}
      connectionSettingsUrl="https://cloud.langfuse.com/project/demo-project/settings/llm-connections"
      onEdit={fn()}
      onEmbeddingChange={fn()}
      onNext={fn()}
      onQuestionEnabled={(name, enabled) =>
        setSelected((current) =>
          current.map((question) =>
            question.name === name ? { ...question, enabled } : question,
          ),
        )
      }
      onSamplePercentChange={fn()}
      onSummaryChange={fn()}
      onWaitMinutesChange={fn()}
      pastCount={{ status: "ready", matched: 412, dailyTraces: 180 }}
      providerGroups={providerGroups}
      questions={selected}
      samplePercent={100}
      projectId="demo-project"
      filter={filter}
      onFilterChange={setFilter}
      traceFilter={{
        ...traceFilterState,
        mode,
        observed: {},
        builderColumns: [...topicsFilterRegistry.columns],
        preview: {
          status: "ready",
          count: 2,
          traces: [
            {
              id: "trace-support-1",
              name: "support-agent",
              timestamp: new Date("2026-11-08T10:00:00Z"),
              environment: "production",
            },
            {
              id: "trace-support-2",
              name: "support-agent",
              timestamp: new Date("2026-11-08T09:30:00Z"),
              environment: "production",
            },
          ],
        },
      }}
      step={step}
      summary={{
        provider: "Amazon Bedrock",
        model: "us.anthropic.claude-haiku-5-5",
      }}
      waitMinutes={5}
    />
  );
}

const meta = preview.meta({
  component: SetupStory,
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
  args: {
    step: "questions" as const,
  },
});

export const Questions = meta.story({
  args: { step: "questions" },
});

export const NoConnection = meta.story({
  args: { step: "questions", connection: "none" },
});

export const NoConnectionViewer = meta.story({
  name: "No connection, cannot add one",
  args: { step: "questions", connection: "viewer" },
});

export const Traces = meta.story({
  args: { step: "traces" },
});

export const Review = meta.story({
  args: { step: "review" },
});

export const RequiresAQuestion = meta.story({
  name: "(Test) Next stays disabled when every question is off",
  args: { step: "questions" },
  play: async () => {
    const body = within(document.body);
    for (const question of TOPIC_SETUP_QUESTIONS)
      await userEvent.click(
        body.getByRole("checkbox", { name: question.name }),
      );
    expect(body.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(body.getByRole("checkbox", { name: "Intent" }));
    expect(body.getByRole("button", { name: "Next" })).toBeEnabled();
  },
});
