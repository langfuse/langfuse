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

export const MappedMediaValue = meta.story({
  args: {
    mappings: [
      {
        variable: "input",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.attachments[0].media",
        },
      },
    ],
    activeMapping: { variable: "input", state: "preview" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject: {
      input: {
        attachments: [
          {
            media:
              "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@",
          },
        ],
      },
    },
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
