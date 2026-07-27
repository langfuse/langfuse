import { Pen } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../.storybook/preview";
import { IconOnlyButton } from "./IconOnlyButton";

const meta = preview.meta({
  component: IconOnlyButton,
});

export const Default = meta.story({
  args: {
    icon: <Pen className="h-4 w-4" aria-hidden="true" />,
    label: "Edit",
    onClick: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    icon: <Pen className="h-4 w-4" aria-hidden="true" />,
    label: "Edit",
    disabledReason: "You don't have permission to edit this item.",
  },
});
