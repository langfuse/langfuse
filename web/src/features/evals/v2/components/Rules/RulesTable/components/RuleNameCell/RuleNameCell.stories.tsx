import { EvalTargetObject, TopicsTargetObject } from "@langfuse/shared";

import preview from "../../../../../../../../../.storybook/preview";
import { RuleNameCell } from "./RuleNameCell";

const meta = preview.meta({ component: RuleNameCell });

export const Default = meta.story({
  args: {
    name: "Production quality checks",
    legacy: false,
    targetObject: EvalTargetObject.EVENT,
  },
});

export const TraceTranscript = meta.story({
  args: {
    name: "Support conversations",
    legacy: false,
    targetObject: TopicsTargetObject,
  },
});

export const Legacy = meta.story({
  args: {
    name: "Legacy trace evaluator",
    legacy: true,
    targetObject: EvalTargetObject.TRACE,
  },
});
