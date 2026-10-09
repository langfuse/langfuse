import { useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { QuestionTypeSelector } from "./QuestionTypeSelector";

const meta = preview.meta({ component: QuestionTypeSelector });

function ControlledQuestionTypeSelector(
  props: Parameters<typeof QuestionTypeSelector>[0],
) {
  const [value, setValue] = useState(props.value);

  return (
    <QuestionTypeSelector
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        props.onValueChange(next);
      }}
    />
  );
}

export const Default = meta.story({
  args: {
    value: DecisionModelQuestionType.CHOICE,
    onValueChange: fn(),
  },
  render: (args) => <ControlledQuestionTypeSelector {...args} />,
});

export const Disabled = meta.story({
  args: {
    value: DecisionModelQuestionType.SCORE,
    disabled: true,
    onValueChange: fn(),
  },
});

export const TestKeyboardSelection = meta.story({
  name: "(Test) Keyboard Selection",
  args: {
    value: DecisionModelQuestionType.CHOICE,
    onValueChange: fn(),
  },
  render: (args) => <ControlledQuestionTypeSelector {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const choice = canvas.getByRole("radio", { name: /Choice/ });
    const score = canvas.getByRole("radio", { name: /Score/ });

    choice.focus();
    await userEvent.keyboard("{ArrowRight>}");

    await expect(score).toHaveFocus();
    await waitFor(() => expect(score).toBeChecked());
    await waitFor(() =>
      expect(args.onValueChange).toHaveBeenCalledWith(
        DecisionModelQuestionType.SCORE,
      ),
    );

    await userEvent.keyboard("{/ArrowRight}");
  },
});
