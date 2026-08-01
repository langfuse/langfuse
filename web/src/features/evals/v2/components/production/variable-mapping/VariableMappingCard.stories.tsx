import { useState } from "react";
import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { type VariableFieldState } from "@/src/features/evals/v2/components/VariableMappingPopover";
import { VariableMappingCard } from "./VariableMappingCard";

const meta = preview.meta({ component: VariableMappingCard });

type VariableMappingCardProps = Parameters<typeof VariableMappingCard>[0];

function StatefulVariableMappingCard(args: VariableMappingCardProps) {
  const [activeVariable, setActiveVariable] = useState(args.activeVariable);
  const [fields, setFields] = useState<Record<string, VariableFieldState>>({
    input: { selectedColumnId: "input", jsonSelector: "$.messages[*].content" },
    expected_output: { selectedColumnId: "output", jsonSelector: "$.answer" },
  });

  return (
    <VariableMappingCard
      {...args}
      activeVariable={activeVariable}
      onActiveVariableChange={setActiveVariable}
      getFieldState={(variable) =>
        fields[variable] ?? { selectedColumnId: "", jsonSelector: null }
      }
      onChangeField={(variable, next) =>
        setFields((current) => ({ ...current, [variable]: next }))
      }
    />
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

export const MappedValues = meta.story({
  args: {
    overview: [
      {
        variable: "input",
        label: "Input › messages › [*] › content",
        unmapped: false,
      },
      {
        variable: "expected_output",
        label: "Output › answer",
        unmapped: false,
      },
    ],
    activeVariable: null,
    onActiveVariableChange: fn(),
    getFieldState: () => ({ selectedColumnId: "", jsonSelector: null }),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMappingCard,
});

export const TreeSelection = meta.story({
  args: {
    overview: [{ variable: "input", label: "Input", unmapped: false }],
    activeVariable: "input",
    onActiveVariableChange: fn(),
    getFieldState: () => ({ selectedColumnId: "", jsonSelector: null }),
    onChangeField: fn(),
    onDeleteVariable: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMappingCard,
});

export const ExpandedPreview = meta.story({
  args: {
    overview: [
      {
        variable: "input",
        label: "Input › messages › [*] › content",
        unmapped: false,
      },
    ],
    activeVariable: null,
    onActiveVariableChange: fn(),
    getFieldState: () => ({ selectedColumnId: "", jsonSelector: null }),
    onChangeField: fn(),
    sourceObject,
    hasMatchingObservations: true,
  },
  render: StatefulVariableMappingCard,
});

export const NoMatchingSample = meta.story({
  args: {
    overview: [{ variable: "input", label: "not mapped yet", unmapped: true }],
    activeVariable: "input",
    onActiveVariableChange: fn(),
    getFieldState: () => ({ selectedColumnId: "", jsonSelector: null }),
    onChangeField: fn(),
    sourceObject: null,
    hasMatchingObservations: false,
    sourceUnavailableMessage: "No observations match this rule yet.",
  },
  render: StatefulVariableMappingCard,
});
