import { ScoreDataTypeEnum } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { ScoreOutputSection } from "./ScoreOutputSection";

const meta = preview.meta({
  component: ScoreOutputSection,
});

export const Boolean = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.BOOLEAN,
      scoreDescription: "",
      reasoningDescription: "",
      choices: [],
      minValue: "",
      maxValue: "",
    },
    onChange: fn(),
  },
});

export const Categories = meta.story({
  args: {
    state: {
      dataType: ScoreDataTypeEnum.CATEGORICAL,
      scoreDescription: "",
      reasoningDescription: "",
      choices: [
        { label: "Incorrect", value: "0" },
        { label: "Correct", value: "1" },
      ],
      minValue: "",
      maxValue: "",
    },
    onChange: fn(),
  },
});
