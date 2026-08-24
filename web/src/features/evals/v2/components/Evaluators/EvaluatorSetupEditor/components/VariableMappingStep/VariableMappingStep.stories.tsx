import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { VariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import { VariableMappingStep } from "./VariableMappingStep";

const meta = preview.meta({ component: VariableMappingStep });

const mappings = [
  {
    variable: "input",
    fieldState: { selectedColumnId: "input", jsonSelector: null },
  },
  {
    variable: "output",
    fieldState: { selectedColumnId: "output", jsonSelector: null },
  },
];

export const WithSample = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    mappingEditor: (
      <VariableMapping
        mode="editable"
        mappings={mappings}
        activeMapping={null}
        onActiveMappingChange={fn()}
        onChangeField={fn()}
        sourceObject={{
          input: "What is the capital of France?",
          output: "Paris",
        }}
        hasMatchingObservations
        sourceUnavailableMessage="Select a sample observation in the test panel to preview mapped values."
      />
    ),
  },
});

export const WithoutSample = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    mappingEditor: (
      <VariableMapping
        mode="editable"
        mappings={mappings}
        activeMapping={null}
        onActiveMappingChange={fn()}
        onChangeField={fn()}
        sourceObject={null}
        hasMatchingObservations={false}
        sourceUnavailableMessage="Select a sample observation in the test panel to preview mapped values."
      />
    ),
  },
});
