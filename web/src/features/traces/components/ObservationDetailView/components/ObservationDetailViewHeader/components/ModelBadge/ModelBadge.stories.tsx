import preview from "../../../../../../../../../.storybook/preview";
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

// Only the linked branch has a story: the unlinked branch renders
// `UpsertModelFormDialog`, which needs a tRPC provider Storybook does not have.
export const Linked = meta.story({});
