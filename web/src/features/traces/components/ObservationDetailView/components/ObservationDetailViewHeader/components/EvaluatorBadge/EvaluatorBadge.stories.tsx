import preview from "../../../../../../../../../.storybook/preview";
import { EvaluatorBadge } from "./EvaluatorBadge";

const meta = preview.meta({
  component: EvaluatorBadge,
  args: {
    evaluatorId: "evaluator-id",
    evaluatorName: "Quality check",
    environment: "langfuse-llm-as-a-judge",
    projectId: "project-id",
  },
});

export const Named = meta.story({});

export const WithoutName = meta.story({
  args: {
    evaluatorName: null,
  },
});
