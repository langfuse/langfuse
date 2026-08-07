import { ScoreDataTypeEnum } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../../../../../../.storybook/preview";
import { ScoreOutputSection } from "./ScoreOutputSection";

const meta = preview.meta({ component: ScoreOutputSection });

export const Numeric = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.NUMERIC,
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

export const Boolean = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.BOOLEAN,
      choices: [],
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
      choices: [],
      minValue: "",
      maxValue: "",
    },
    onChange: fn(),
    readOnly: true,
  },
});
