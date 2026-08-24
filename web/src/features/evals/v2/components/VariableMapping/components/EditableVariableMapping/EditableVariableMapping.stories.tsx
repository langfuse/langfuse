import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { EditableVariableMapping } from "./EditableVariableMapping";

const meta = preview.meta({ component: EditableVariableMapping });

export const MappedValue = meta.story({
  args: {
    mappings: [
      {
        variable: "output",
        fieldState: {
          selectedColumnId: "output",
          jsonSelector: "$.answer",
        },
      },
    ],
    activeMapping: { variable: "output", state: "preview" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject: { output: { answer: "Your order arrives tomorrow." } },
    hasMatchingObservations: true,
  },
});

export const EmptySampleWarning = meta.story({
  args: {
    mappings: [
      {
        variable: "input",
        fieldState: {
          selectedColumnId: "metadata",
          jsonSelector: "$.source",
        },
      },
    ],
    activeMapping: { variable: "input", state: "preview" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject: { metadata: { source: "" } },
    hasMatchingObservations: true,
  },
});
