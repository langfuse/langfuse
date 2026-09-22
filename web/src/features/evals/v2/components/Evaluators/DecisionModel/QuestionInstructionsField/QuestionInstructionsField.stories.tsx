import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { QuestionInstructionsField } from "./QuestionInstructionsField";

const meta = preview.meta({ component: QuestionInstructionsField });

export const Default = meta.story({
  args: {
    value: "Does `input` request a refund?",
    stateKeys: ["input", "output", "policy"],
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <QuestionInstructionsField
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const Empty = meta.story({
  args: {
    value: "",
    stateKeys: ["input", "output"],
    placeholder: "Which team should handle this ticket?",
    onChange: fn(),
  },
});

export const UnknownFieldReference = meta.story({
  args: {
    value: "Does `reply` answer `question` fully?",
    stateKeys: ["input", "output"],
    onChange: fn(),
  },
});

export const Error = meta.story({
  args: {
    value: "",
    stateKeys: ["input", "output"],
    error: "Every question needs instructions.",
    onChange: fn(),
  },
});
