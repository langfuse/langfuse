import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { EvalTemplateSourceCodeLanguageEnum } from "@langfuse/shared";

import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorCodeLanguageSelector } from "./EvaluatorCodeLanguageSelector";

const meta = preview.meta({ component: EvaluatorCodeLanguageSelector });

type EvaluatorCodeLanguageSelectorProps = Parameters<
  typeof EvaluatorCodeLanguageSelector
>[0];

function StatefulEvaluatorCodeLanguageSelector(
  args: EvaluatorCodeLanguageSelectorProps,
) {
  const [, updateArgs] = useArgs<EvaluatorCodeLanguageSelectorProps>();

  return (
    <EvaluatorCodeLanguageSelector
      {...args}
      onValueChange={(value) => {
        updateArgs({ value });
        args.onValueChange(value);
      }}
    />
  );
}

export const Python = meta.story({
  args: {
    value: EvalTemplateSourceCodeLanguageEnum.PYTHON,
    onValueChange: fn(),
  },
  render: StatefulEvaluatorCodeLanguageSelector,
});

export const TypeScript = meta.story({
  args: {
    value: EvalTemplateSourceCodeLanguageEnum.TYPESCRIPT,
    onValueChange: fn(),
  },
  render: StatefulEvaluatorCodeLanguageSelector,
});

export const Disabled = meta.story({
  args: {
    value: EvalTemplateSourceCodeLanguageEnum.PYTHON,
    disabled: true,
    onValueChange: fn(),
  },
  render: StatefulEvaluatorCodeLanguageSelector,
});
