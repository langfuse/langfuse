import { fn } from "storybook/test";

import preview from "../../../../../../../../../../.storybook/preview";
import { ScoreOutputDescriptionFields } from "./ScoreOutputDescriptionFields";

const meta = preview.meta({ component: ScoreOutputDescriptionFields });

export const Empty = meta.story({
  args: {
    scoreDescription: "",
    reasoningDescription: "",
    onScoreDescriptionChange: fn(),
    onReasoningDescriptionChange: fn(),
    disabled: false,
  },
});

export const Disabled = meta.story({
  args: {
    scoreDescription: "Whether the response answers the question",
    reasoningDescription: "Explain the evidence behind the score",
    onScoreDescriptionChange: fn(),
    onReasoningDescriptionChange: fn(),
    disabled: true,
    defaultAdvancedOpen: true,
  },
});
