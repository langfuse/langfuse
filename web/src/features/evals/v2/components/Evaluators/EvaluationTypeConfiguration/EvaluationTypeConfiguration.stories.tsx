import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";
import {
  EvalTemplateSourceCodeLanguageEnum,
  EvalTemplateTypeEnum,
} from "@langfuse/shared";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorCodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/Code/EvaluatorCodeLanguageSelector/EvaluatorCodeLanguageSelector";
import { ExpectedOutputUsageHint } from "./components/ExpectedOutputUsageHint/ExpectedOutputUsageHint";
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
      <>
        <EvaluatorCodeLanguageSelector
          value={EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT}
          onValueChange={fn()}
        />
        <ExpectedOutputUsageHint
          hint={{
            shape:
              "expected_output must be a JSON object with an expected_keywords string array.",
            example:
              '{ "expected_keywords": ["refund", "invoice", "tracking number"] }',
          }}
        />
      </>
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
