import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";
import {
  EvalTemplateSourceCodeLanguageEnum,
  EvalTemplateTypeEnum,
} from "@langfuse/shared";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorCodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/Code/EvaluatorCodeLanguageSelector/EvaluatorCodeLanguageSelector";
import { EvaluationTypeConfiguration } from "./EvaluationTypeConfiguration";

const meta = preview.meta({ component: EvaluationTypeConfiguration });

export const LlmJudge = meta.story({
  args: {
    mode: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    onModeChange: fn(),
    disabled: false,
    children: <Button variant="outline">OpenAI / gpt-4.1-mini</Button>,
  },
});

export const Code = meta.story({
  args: {
    mode: EvalTemplateTypeEnum.CODE,
    onModeChange: fn(),
    disabled: false,
    children: (
      <EvaluatorCodeLanguageSelector
        value={EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT}
        onValueChange={fn()}
      />
    ),
  },
});

export const Disabled = meta.story({
  args: {
    mode: EvalTemplateTypeEnum.CODE,
    onModeChange: fn(),
    disabled: true,
    children: <span>Python</span>,
  },
});
