import { type ComponentProps } from "react";
import preview from "../../../../.storybook/preview";
import { AnnotationQueueDetails } from "./AnnotationQueueDetails";

const scoreConfigs = [
  {
    id: "accuracy",
    name: "Accuracy",
    dataType: "CATEGORICAL",
    description: "How closely does the answer match the expected result?",
    categories: [
      { label: "Correct", value: 1 },
      { label: "Incorrect", value: 0 },
    ],
    isArchived: false,
  },
  {
    id: "confidence",
    name: "Confidence",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 1,
    isArchived: false,
  },
  {
    id: "feedback",
    name: "Feedback",
    dataType: "TEXT",
    description: "Explain anything the reviewer should follow up on.",
    isArchived: false,
  },
  {
    id: "toxicity",
    name: "Toxicity",
    dataType: "BOOLEAN",
    isArchived: false,
  },
  {
    id: "legacy",
    name: "Legacy rating",
    dataType: "NUMERIC",
    minValue: 1,
    maxValue: 5,
    isArchived: true,
  },
] satisfies ComponentProps<typeof AnnotationQueueDetails>["scoreConfigs"];

const meta = preview.meta({
  component: AnnotationQueueDetails,
  render: (args) => (
    <div className="w-80">
      <AnnotationQueueDetails {...args} />
    </div>
  ),
});

export const Default = meta.story({
  args: {
    description: "Review answer quality and leave feedback for the team.",
    scoreConfigs,
  },
});

export const Empty = meta.story({
  args: { description: null, scoreConfigs: [] },
});

export const WithLongText = meta.story({
  args: {
    description:
      "Review answers that require additional context.\nInclude the reason for any score that needs follow-up.",
    scoreConfigs: [
      {
        ...scoreConfigs[0],
        name: "Answer quality for complex requests",
        description:
          "Consider whether the answer is complete, supported by the provided context, and clear enough for someone unfamiliar with the conversation.",
      },
    ],
  },
});
