import { useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import { expect, fn, within } from "storybook/test";

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

export const ShowsGuidanceFromTheInfoIcon = meta.story({
  name: "(Test) Shows type guidance from the info icon",
  args: {
    value: DecisionModelQuestionType.CHOICE,
    onValueChange: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByLabelText("About Choice"));

    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Writes a categorical score.");
  },
});

export const Disabled = meta.story({
  args: {
    value: DecisionModelQuestionType.SCORE,
    disabled: true,
    onValueChange: fn(),
  },
});
