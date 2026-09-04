import { useState } from "react";
import { fn, userEvent } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

import { VariableMapping } from "./VariableMapping";

const meta = preview.meta({ component: VariableMapping });

type VariableMappingProps = Parameters<typeof VariableMapping>[0];
type EditableVariableMappingProps = Extract<
  VariableMappingProps,
  { mode: "editable" }
>;

function StatefulEditableVariableMapping(args: EditableVariableMappingProps) {
  const [activeMapping, setActiveMapping] = useState(args.activeMapping);
  const [fields, setFields] = useState<Record<string, VariableFieldState>>(() =>
    Object.fromEntries(
      args.mappings.map(({ variable, fieldState }) => [variable, fieldState]),
    ),
  );

  return (
    <VariableMapping
      {...args}
      mappings={args.mappings.map(({ variable }) => ({
        variable,
        fieldState: fields[variable] ?? {
          selectedColumnId: null,
          jsonSelector: null,
        },
      }))}
      activeMapping={activeMapping}
      onActiveMappingChange={setActiveMapping}
      onChangeField={(variable, next) =>
        setFields((current) => ({ ...current, [variable]: next }))
      }
    />
  );
}

function StatefulVariableMapping(args: VariableMappingProps) {
  return args.mode === "editable" ? (
    <StatefulEditableVariableMapping {...args} />
  ) : (
    <VariableMapping {...args} />
  );
}

const sourceObject = {
  input: {
    user_input: "Admin renamed an Okta group and users cannot log in.",
    retrieved_docs: ["SSO group mapping guide", "SCIM sync troubleshooting"],
    tool_result: {
      stale_mapping: true,
      last_sync: "2026-07-29T08:15:00Z",
    },
  },
  output: { answer: "Your order arrives tomorrow." },
  metadata: { locale: "en-US" },
};

const stringifiedJsonSourceObject = {
  ...sourceObject,
  input: JSON.stringify({
    messages: [
      { role: "user", content: "Where is my order?" },
      { role: "assistant", content: "Your order arrives tomorrow." },
    ],
  }),
};

export const MappedValues = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "input",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.user_input",
        },
      },
      {
        variable: "expected_output",
        fieldState: {
          selectedColumnId: "output",
          jsonSelector: "$.answer",
        },
      },
    ],
    activeMapping: null,
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMapping,
});

export const TreeSelection = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "input",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.user_input",
        },
      },
    ],
    activeMapping: { variable: "input", state: "editing" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    onDeleteVariable: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMapping,
});

export const TextPreview = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "expected_output",
        fieldState: {
          selectedColumnId: "output",
          jsonSelector: "$.answer",
        },
      },
    ],
    activeMapping: { variable: "expected_output", state: "preview" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMapping,
});

export const JsonPreview = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "input",
        fieldState: { selectedColumnId: "input", jsonSelector: null },
      },
    ],
    activeMapping: { variable: "input", state: "preview" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject: stringifiedJsonSourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMapping,
});

export const EmptySampleWarning = meta.story({
  args: {
    mode: "editable",
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
  render: StatefulVariableMapping,
});

export const NoMatchingSample = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "input",
        fieldState: { selectedColumnId: null, jsonSelector: null },
      },
    ],
    activeMapping: { variable: "input", state: "editing" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject: null,
    hasMatchingObservations: false,
    sourceUnavailableMessage: "No observations match this rule yet.",
  },
  render: StatefulVariableMapping,
});

export const EditableLongPath = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "support_ticket",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.customer.support.tickets[*].messages[*].content",
        },
      },
    ],
    activeMapping: null,
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: (args) => (
    <div className="w-[42rem] max-w-full">
      <StatefulVariableMapping {...args} />
    </div>
  ),
});

export const EditableLongPathTruncated = meta.story({
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "support_ticket_with_a_long_name",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.customer.support.tickets[*].messages[*].content",
        },
      },
    ],
    activeMapping: null,
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: (args) => (
    <div className="w-[32rem] max-w-full">
      <StatefulVariableMapping {...args} />
    </div>
  ),
});

export const ReadOnly = meta.story({
  args: {
    mode: "read-only",
    mappings: [
      {
        variable: "input",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.messages[*].content",
        },
      },
      {
        variable: "expected_output",
        fieldState: {
          selectedColumnId: "output",
          jsonSelector: "$.answer",
        },
      },
    ],
  },
});

export const ReadOnlyLongPath = meta.story({
  args: {
    mode: "read-only",
    mappings: [
      {
        variable: "support_ticket_with_a_long_name",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.customer.support.tickets[*].messages[*].content",
        },
      },
    ],
  },
  render: (args) => (
    <div className="w-[32rem] max-w-full">
      <VariableMapping {...args} />
    </div>
  ),
});

export const ReadOnlyEmpty = meta.story({
  args: { mode: "read-only", mappings: [] },
});

export const EditableEmpty = meta.story({
  args: {
    mode: "editable",
    mappings: [],
    activeMapping: null,
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMapping,
});

export const OpensJsonPathInput = meta.story({
  name: "(Test) Opens JSONPath Input",
  args: {
    mode: "editable",
    mappings: [
      {
        variable: "input",
        fieldState: {
          selectedColumnId: "input",
          jsonSelector: "$.messages[*].content",
        },
      },
    ],
    activeMapping: { variable: "input", state: "editing" },
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    sourceObject: stringifiedJsonSourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMapping,
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Type a JSONPath instead" }),
    );
  },
});
