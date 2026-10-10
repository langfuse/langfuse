import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { EvaluatorAssistantActionButton } from "./EvaluatorAssistantActionButton";

const meta = preview.meta({ component: EvaluatorAssistantActionButton });

export const Create = meta.story({
  args: {
    label: "Create with AI",
    disabled: false,
    onClick: fn(),
  },
});

export const Edit = meta.story({
  args: {
    label: "Edit with AI",
    disabled: false,
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    label: "Create with AI",
    disabled: true,
    onClick: fn(),
  },
});
