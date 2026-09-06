import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { getMessages } from "@/src/features/i18n/messages";
import { CategoryEditorPopover } from "./CategoryEditorPopover";

describe("CategoryEditorPopover", () => {
  it("confirms the category name when Enter is pressed", () => {
    const onDone = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={getMessages("en")}>
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
        </CategoryEditorPopover>
      </NextIntlClientProvider>,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Category label" }), {
      key: "Enter",
    });

    expect(onDone).toHaveBeenCalledOnce();
  });
});
