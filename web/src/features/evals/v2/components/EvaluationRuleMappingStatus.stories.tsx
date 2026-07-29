import preview from "../../../../../.storybook/preview";
import { EvaluationRuleMappingStatus } from "./EvaluationRuleMappingStatus";

const meta = preview.meta({
  component: EvaluationRuleMappingStatus,
});

export const Complete = meta.story({
  args: {
    mappedCount: 2,
    variableCount: 2,
  },
});

export const Incomplete = meta.story({
  args: {
    mappedCount: 1,
    variableCount: 2,
  },
});
