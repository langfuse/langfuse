import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { OpenAIQuestionInstructions } from "./OpenAIQuestionInstructions";

const meta = preview.meta({ component: OpenAIQuestionInstructions });

export const Default = meta.story({
  args: {
    value: "Which team should handle this ticket?",
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <OpenAIQuestionInstructions
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
    placeholder: "Which team should handle this ticket?",
    onChange: fn(),
  },
});

export const Error = meta.story({
  args: {
    value: "",
    error: "Every question needs instructions.",
    onChange: fn(),
  },
});
