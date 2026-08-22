import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { CategoryEditorPopover } from "./CategoryEditorPopover";

describe("CategoryEditorPopover", () => {
  it("confirms the category name when Enter is pressed", () => {
    const onDone = vi.fn();
    render(
      <CategoryEditorPopover
        title="Edit category"
        idSuffix="test"
        choice={{ label: "Correct" }}
        open
        onOpenChange={vi.fn()}
        onChange={vi.fn()}
        onDelete={null}
        onDone={onDone}
      >
        <PopoverTrigger asChild>
          <Button>Correct</Button>
        </PopoverTrigger>
      </CategoryEditorPopover>,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Category label" }), {
      key: "Enter",
    });

    expect(onDone).toHaveBeenCalledOnce();
  });
});
