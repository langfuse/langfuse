import preview from "../../../../../../.storybook/preview";
import { ModelParametersBadges } from "./ModelParametersBadges";

const meta = preview.meta({
  component: ModelParametersBadges,
  args: {
    entries: [
      ["temperature", 0.7],
      ["maxTokens", 2048],
      ["responseFormat", { type: "json_object" }],
    ],
  },
});

export const Default = meta.story({});

export const LongValue = meta.story({
  args: {
    entries: [
      [
        "stop",
        "A long model parameter value that should truncate when space is constrained",
      ],
    ],
  },
});
