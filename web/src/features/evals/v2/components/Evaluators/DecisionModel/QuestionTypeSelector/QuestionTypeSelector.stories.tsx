import { useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import { expect, fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { QuestionTypeSelector } from "./QuestionTypeSelector";

const meta = preview.meta({ component: QuestionTypeSelector });

export const Default = meta.story({
  args: {
    value: DecisionModelQuestionType.CHOICE,
    onValueChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <QuestionTypeSelector
        {...args}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange(next);
        }}
      />
    );
  },
});

export const DescribesEachTypeWithoutRenamingItsTab = meta.story({
  name: "(Test) Describes each type without renaming its tab",
  args: {
    value: DecisionModelQuestionType.CHOICE,
    onValueChange: fn(),
  },
  play: async ({ canvas }) => {
    const choice = canvas.getByRole("tab", { selected: true });

    await expect(choice).toHaveAccessibleName("Choice");
    await expect(choice).toHaveAccessibleDescription(
      expect.stringContaining("Writes a categorical score."),
    );
  },
});

export const ArrowKeysMoveFocusWithoutSelecting = meta.story({
  name: "(Test) Arrow keys move focus without selecting",
  args: {
    value: DecisionModelQuestionType.SCORE,
    onValueChange: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    canvas.getByRole("tab", { selected: true }).focus();
    await userEvent.keyboard("{ArrowRight}");

    await expect(args.onValueChange).not.toHaveBeenCalled();

    await userEvent.keyboard("{Enter}");

    await expect(args.onValueChange).toHaveBeenCalledWith(
      DecisionModelQuestionType.NOUL,
    );
  },
});

export const SwitchesToDropdownInNarrowSlot = meta.story({
  name: "(Test) Switches to a dropdown in a narrow slot",
  args: {
    value: DecisionModelQuestionType.SCORE,
    onValueChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-40">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const dropdown = await canvas.findByRole("combobox", {
      name: "Question type",
    });

    await expect(dropdown).toBeVisible();
    await expect(dropdown).toHaveAccessibleDescription(
      expect.stringContaining("Writes a numeric score"),
    );
    await expect(canvas.queryByRole("tab")).toBeNull();
  },
});

export const ReturnsToTabsWhenItsRowWidens = meta.story({
  name: "(Test) Returns to tabs when its row gets wide again",
  args: {
    value: DecisionModelQuestionType.SCORE,
    onValueChange: fn(),
  },
  render: (args) => {
    const [wide, setWide] = useState(false);
    return (
      <div className={wide ? "w-96" : "w-40"}>
        <button type="button" onClick={() => setWide(true)}>
          Widen
        </button>
        {/* The selector sits in a wrapping row, as in a labelled field. */}
        <div className="flex flex-wrap items-center gap-2">
          <QuestionTypeSelector {...args} />
        </div>
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("combobox", { name: "Question type" });

    await userEvent.click(canvas.getByRole("button", { name: "Widen" }));

    await expect(await canvas.findAllByRole("tab")).toHaveLength(3);
  },
});

export const Disabled = meta.story({
  args: {
    value: DecisionModelQuestionType.SCORE,
    disabled: true,
    onValueChange: fn(),
  },
});
