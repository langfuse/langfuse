import { ScoreDataTypeEnum } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { ScoreOutputSection } from "./ScoreOutputSection";

const meta = preview.meta({ component: ScoreOutputSection });

export const Numeric = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.NUMERIC,
      scoreDescription: "",
      reasoningDescription: "",
      choices: [],
      minValue: "0",
      maxValue: "1",
    },
    onChange: fn(),
  },
});

export const Categorical = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.CATEGORICAL,
      scoreDescription: "Sentiment",
      reasoningDescription: "",
      choices: [
        { label: "Positive", value: "1" },
        { label: "Negative", value: "0" },
      ],
      minValue: "",
      maxValue: "",
    },
    onChange: fn(),
  },
});

export const ReadOnly = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.BOOLEAN,
      scoreDescription: "Whether the answer is correct",
      reasoningDescription: "Explain the decision",
      choices: [],
      minValue: "",
      maxValue: "",
    },
    onChange: fn(),
    readOnly: true,
  },
});
