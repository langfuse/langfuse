import { useState } from "react";
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
      "eu.anthropic.claude-haiku-4-5",
      "eu.anthropic.claude-sonnet-4-5",
      "cohere.embed-english-v3",
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

function SetupStory({ step }: { step: "questions" | "traces" | "review" }) {
  const [selected, setSelected] = useState(questions);
  return (
    <TopicSetupFlowDialog
      advancedOpen={false}
      busy={false}
      canWrite
      clustering={{
        provider: "Amazon Bedrock",
        model: "eu.anthropic.claude-sonnet-4-5",
      }}
      connectionCaption="Amazon Bedrock"
      embedding={{
        provider: "Amazon Bedrock",
        model: "cohere.embed-english-v3",
      }}
      embeddingProviderGroups={providerGroups}
      error={null}
      onAdvancedOpenChange={fn()}
      onBack={fn()}
      onClusteringChange={fn()}
      onConfigureProviders={fn()}
      onEdit={fn()}
      onEmbeddingChange={fn()}
      onNext={fn()}
      onPastDaysChange={fn()}
      onPastOnChange={fn()}
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
      pastCount={{ status: "ready", matched: 412 }}
      pastDays={7}
      pastOn
      providerGroups={providerGroups}
      questions={selected}
      renderFilter={() => (
        <p className="text-muted-foreground text-sm">isRootObservation:true</p>
      )}
      samplePercent={100}
      step={step}
      summary={{
        provider: "Amazon Bedrock",
        model: "eu.anthropic.claude-haiku-4-5",
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
