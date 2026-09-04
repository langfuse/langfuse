import preview from "../../../../../../.storybook/preview";
import { ModelBadge } from "./ModelBadge";

const meta = preview.meta({
  component: ModelBadge,
  args: {
    model: "gpt-5.4",
    internalModelId: "model-id",
    projectId: "project-id",
    usageDetails: undefined,
  },
});

export const Linked = meta.story({});
