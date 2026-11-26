import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { expect, fn, userEvent, within } from "storybook/test";

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

export const TestConfirmOnEnter = meta.story({
  name: "(Test) Confirms the category name when Enter is pressed",
  args: Edit.input.args,
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Category label" });
    await expect(input).toHaveValue("Correct");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await expect(args.onDone).toHaveBeenCalledOnce();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
    await expect(args.onDelete).not.toHaveBeenCalled();
  },
});
