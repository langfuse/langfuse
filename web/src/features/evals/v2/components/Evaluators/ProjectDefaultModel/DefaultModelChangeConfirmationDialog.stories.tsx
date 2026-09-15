import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { DefaultModelChangeConfirmationDialog } from "./DefaultModelChangeConfirmationDialog";

const meta = preview.meta({ component: DefaultModelChangeConfirmationDialog });

const defaultArgs = {
  open: true,
  currentModel: { provider: "OpenAI", model: "gpt-4.1" },
  nextModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
  loading: false,
  onOpenChange: fn(),
  onConfirm: fn(),
};

export const UpdateDefault = meta.story({
  args: defaultArgs,
});

export const SetDefault = meta.story({
  args: {
    ...defaultArgs,
    currentModel: null,
  },
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    loading: true,
  },
});
