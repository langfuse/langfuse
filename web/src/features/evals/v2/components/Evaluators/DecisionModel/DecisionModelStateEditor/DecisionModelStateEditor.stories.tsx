import { useState } from "react";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import type { ActiveVariableMapping } from "@/src/features/evals/v2/types/variableMapping";
import {
  DecisionModelStateEditor,
  type DecisionModelStateField,
} from "./DecisionModelStateEditor";

const meta = preview.meta({ component: DecisionModelStateEditor });

const SAMPLE = {
  input: {
    messages: [
      { role: "system", content: "You are a support agent for Acme." },
      {
        role: "user",
        content:
          "My order #4411 arrived broken and I want my money back. This is the second time.",
      },
    ],
  },
  output: {
    answer:
      "I'm sorry about that. I've issued a full refund for order #4411; it will show up within 3-5 business days.",
    tool_calls: [{ name: "issue_refund", args: { order: "4411" } }],
  },
  metadata: { channel: "email", tier: "gold" },
};

const FIELDS: DecisionModelStateField[] = [
  {
    key: "input",
    fieldState: {
      selectedColumnId: "input",
      jsonSelector: "$.messages[1].content",
    },
  },
  {
    key: "output",
    fieldState: { selectedColumnId: "output", jsonSelector: "$.answer" },
  },
];

const callbacks = {
  onActiveMappingChange: fn(),
  onChangeField: fn(),
  onAddField: fn(),
  onRemoveField: fn(),
};

/** Full flow: expand, re-map, add and remove fields, inspect the object. */
export const Default = meta.story({
  args: {
    ...callbacks,
    fields: FIELDS,
    activeMapping: { variable: "input", state: "preview" },
    sourceObject: SAMPLE,
    hasMatchingObservations: true,
  },
  render: (args) => {
    const [fields, setFields] = useState(args.fields);
    const [activeMapping, setActiveMapping] = useState<ActiveVariableMapping>(
      args.activeMapping,
    );
    return (
      <DecisionModelStateEditor
        {...args}
        fields={fields}
        activeMapping={activeMapping}
        onActiveMappingChange={(next) => {
          setActiveMapping(next);
          args.onActiveMappingChange(next);
        }}
        onChangeField={(key, fieldState) => {
          setFields((current) =>
            current.map((field) =>
              field.key === key ? { ...field, fieldState } : field,
            ),
          );
          args.onChangeField(key, fieldState);
        }}
        onAddField={(key) => {
          setFields((current) => [
            ...current,
            { key, fieldState: { selectedColumnId: "", jsonSelector: "" } },
          ]);
          setActiveMapping({ variable: key, state: "editing" });
          args.onAddField(key);
        }}
        onRemoveField={(key) => {
          setFields((current) => current.filter((field) => field.key !== key));
          args.onRemoveField(key);
        }}
      />
    );
  },
});

export const NoSample = meta.story({
  args: {
    ...callbacks,
    fields: FIELDS,
    activeMapping: null,
    sourceObject: null,
    hasMatchingObservations: false,
  },
});

export const StateTooLarge = meta.story({
  args: {
    ...callbacks,
    fields: [
      {
        key: "transcript",
        fieldState: { selectedColumnId: "input", jsonSelector: "" },
      },
    ],
    activeMapping: null,
    sourceObject: {
      input: Array.from({ length: 120 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        content: `Turn ${index}: ${"lorem ipsum dolor sit amet ".repeat(12)}`,
      })),
    },
    hasMatchingObservations: true,
  },
});
