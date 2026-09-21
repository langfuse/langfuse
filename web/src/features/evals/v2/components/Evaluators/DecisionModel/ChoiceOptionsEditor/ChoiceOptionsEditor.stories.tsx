import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { ChoiceOptionsEditor } from "./ChoiceOptionsEditor";

const meta = preview.meta({ component: ChoiceOptionsEditor });

const OPTIONS = [
  {
    value: "ready",
    description: "Answers the request and states the next step.",
  },
  { value: "needs_revision", description: "Accurate but incomplete." },
  { value: "unsafe", description: "" },
];

export const Chips = meta.story({
  args: { options: OPTIONS, layout: "chips", onChange: fn() },
  render: (args) => {
    const [options, setOptions] = useState(args.options);
    return (
      <ChoiceOptionsEditor
        {...args}
        options={options}
        onChange={(next) => {
          setOptions(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const List = meta.story({
  args: { options: OPTIONS, layout: "list", onChange: fn() },
  render: (args) => {
    const [options, setOptions] = useState(args.options);
    return (
      <ChoiceOptionsEditor
        {...args}
        options={options}
        onChange={(next) => {
          setOptions(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const Error = meta.story({
  args: {
    options: [
      { value: "yes", description: "" },
      { value: "yes", description: "" },
    ],
    layout: "chips",
    error: "Option labels must be unique.",
    onChange: fn(),
  },
});
