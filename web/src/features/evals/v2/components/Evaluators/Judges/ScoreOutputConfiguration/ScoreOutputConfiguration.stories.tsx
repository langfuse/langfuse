import { ScoreDataTypeEnum } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { ScoreOutputConfiguration } from "./ScoreOutputConfiguration";

const state = {
  dataType: ScoreDataTypeEnum.NUMERIC,
  scoreDescription: "Measures factual accuracy",
  reasoningDescription: "Explain which evidence supports the score",
  choices: [],
  shouldAllowMultipleMatches: false,
  minValue: "0",
  maxValue: "1",
};

const meta = preview.meta({ component: ScoreOutputConfiguration });

export const Editable = meta.story({
  args: { state, mode: "editable", onChange: fn() },
});

export const ReadOnly = meta.story({
  args: { state, mode: "read-only" },
});
