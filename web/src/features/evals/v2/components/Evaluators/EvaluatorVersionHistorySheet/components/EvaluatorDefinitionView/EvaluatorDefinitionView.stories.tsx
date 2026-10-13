import { EvalTemplateTypeEnum } from "@langfuse/shared";

import preview from "../../../../../../../../../.storybook/preview";
import { EvaluatorDefinitionView } from "./EvaluatorDefinitionView";

const meta = preview.meta({ component: EvaluatorDefinitionView });

export const LlmAsAJudge = meta.story({
  args: {
    definition: {
      type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      promptMessages: [
        {
          role: "user",
          content: "Judge whether {{output}} correctly answers {{input}}.",
        },
      ],
      selectedModel: { provider: "openai", model: "gpt-4.1-mini" },
      defaultModel: null,
      outputDefinition: null,
      variableMappings: {
        state: "visible",
        mappings: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: null,
          },
        ],
      },
    },
  },
});

export const Code = meta.story({
  args: {
    definition: {
      type: EvalTemplateTypeEnum.CODE,
      sourceCode:
        "export default function evaluate({ output }) {\n  return { score: output ? 1 : 0 };\n}",
      sourceCodeLanguage: "TYPESCRIPT",
    },
  },
});
