import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";

import preview from "../../../../../../../../../../../../.storybook/preview";
import { CategoryEditorPopover } from "./CategoryEditorPopover";

const meta = preview.meta({ component: CategoryEditorPopover });

export const Edit = meta.story({
  args: {
    trigger: <Button variant="outline">Correct</Button>,
    title: "Edit category",
    idSuffix: "correct",
    choice: { label: "Correct", value: "1" },
    open: true,
    onOpenChange: fn(),
    onChange: fn(),
    onDelete: fn(),
    onDone: fn(),
  },
});

export const Add = meta.story({
  args: {
    trigger: <Button variant="outline">Add category</Button>,
    title: "Add category",
    idSuffix: "new",
    choice: { label: "", value: "2" },
    open: true,
    onOpenChange: fn(),
    onChange: fn(),
    onDelete: null,
    onDone: fn(),
  },
});
