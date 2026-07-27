import { SquarePen } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { Button } from "./button";

const meta = preview.meta({
  component: Button,
});

export const Default = meta.story({
  args: {
    children: "Button",
    onClick: fn(),
  },
});

export const StartAligned = meta.story({
  args: {
    alignment: "start",
    children: "Start aligned",
    className: "w-48",
    onClick: fn(),
  },
});

export const RowAction = meta.story({
  args: {
    "aria-label": "Edit",
    children: <SquarePen className="h-4 w-4" aria-hidden="true" />,
    onClick: fn(),
    size: "icon",
    variant: "row-action",
  },
});
