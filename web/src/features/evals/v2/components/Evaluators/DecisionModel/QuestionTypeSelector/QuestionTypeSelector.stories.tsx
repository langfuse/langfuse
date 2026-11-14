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

export const LinksGuidanceOutsideTheRadio = meta.story({
  name: "(Test) Links type guidance from outside the radio",
  args: {
    value: DecisionModelQuestionType.CHOICE,
    onValueChange: fn(),
  },
  play: async ({ canvas }) => {
    const choice = canvas.getByRole("radio", { name: /Choice/ });
    const help = canvas.getByRole("button", { name: "About Choice" });
    const describedBy = choice.getAttribute("aria-describedby");

    await expect(choice).not.toContainElement(help);
    await expect(describedBy).toBeTruthy();
    await expect(document.getElementById(describedBy ?? "")).toHaveTextContent(
      "Writes a categorical score.",
    );
  },
});

export const Disabled = meta.story({
  args: {
    value: DecisionModelQuestionType.SCORE,
    disabled: true,
    onValueChange: fn(),
  },
});
