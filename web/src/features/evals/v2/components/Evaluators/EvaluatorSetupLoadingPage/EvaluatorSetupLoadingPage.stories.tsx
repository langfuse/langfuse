import preview from "../../../../../../../.storybook/preview";
import { EvaluatorSetupLoadingPage } from "./EvaluatorSetupLoadingPage";

const meta = preview.meta({
  component: EvaluatorSetupLoadingPage,
});

export const Creating = meta.story({
  args: {
    mode: "create",
    projectId: "project-1",
  },
});

export const Editing = meta.story({
  args: {
    mode: "edit",
    projectId: "project-1",
  },
});
