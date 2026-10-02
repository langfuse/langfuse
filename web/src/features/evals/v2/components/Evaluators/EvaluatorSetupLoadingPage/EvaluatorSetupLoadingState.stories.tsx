import preview from "../../../../../../../.storybook/preview";
import { EvaluatorSetupLoadingState } from "./EvaluatorSetupLoadingState";

const meta = preview.meta({
  component: EvaluatorSetupLoadingState,
});

export const Creating = meta.story({
  args: {
    mode: "create",
  },
});

export const Editing = meta.story({
  args: {
    mode: "edit",
  },
});
