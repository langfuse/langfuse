import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { ScoreLevelsEditor } from "./ScoreLevelsEditor";

const meta = preview.meta({ component: ScoreLevelsEditor });

export const Default = meta.story({
  args: {
    levels: [
      { description: "Calm, just stating facts" },
      { description: "Frustrated but civil" },
      { description: "Very angry, strong language or threatening to leave" },
    ],
    onChange: fn(),
  },
  render: (args) => {
    const [levels, setLevels] = useState(args.levels);
    return (
      <ScoreLevelsEditor
        {...args}
        levels={levels}
        onChange={(next) => {
          setLevels(next);
          args.onChange(next);
        }}
      />
    );
  },
});

export const Empty = meta.story({
  args: {
    levels: [{ description: "" }, { description: "" }],
    onChange: fn(),
  },
});

export const Error = meta.story({
  args: {
    levels: [{ description: "Low" }, { description: "" }],
    error: "Every level needs a description.",
    onChange: fn(),
  },
});
