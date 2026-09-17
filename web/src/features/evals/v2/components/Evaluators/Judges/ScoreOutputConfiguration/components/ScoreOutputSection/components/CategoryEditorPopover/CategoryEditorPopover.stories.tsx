import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { fn } from "storybook/test";

import preview from "../../../../../../../../../../../../.storybook/preview";
import { CategoryEditorPopover } from "./CategoryEditorPopover";

const meta = preview.meta({ component: CategoryEditorPopover });

export const Edit = meta.story({
  args: {
    children: (
      <PopoverTrigger asChild>
        <Button variant="outline">Correct</Button>
      </PopoverTrigger>
    ),
    title: "Edit category",
    idSuffix: "correct",
    choice: { label: "Correct" },
    open: true,
    onOpenChange: fn(),
    onChange: fn(),
    onDelete: fn(),
    onDone: fn(),
  },
});

export const Add = meta.story({
  args: {
    children: (
      <PopoverTrigger asChild>
        <Button variant="outline">Add category</Button>
      </PopoverTrigger>
    ),
    title: "Add category",
    idSuffix: "new",
    choice: { label: "" },
    open: true,
    onOpenChange: fn(),
    onChange: fn(),
    onDelete: null,
    onDone: fn(),
  },
});
