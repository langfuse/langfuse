import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { FilterBuilderDropdown } from "./FilterBuilderDropdown";

const meta = preview.meta({
  render: function Render({ initialValue }: { initialValue: FilterState }) {
    const [value, setValue] = useState(initialValue);

    return (
      <FilterBuilderDropdown
        variant="icon"
        label="Filter runs"
        value={value}
        onChange={setValue}
        columns={[
          {
            id: "tokens",
            name: "Tokens",
            type: "number",
            internal: "tokens",
            min: 0,
            step: 1,
          },
          {
            id: "start",
            name: "Start time",
            type: "datetime",
            internal: "start",
          },
          { id: "root", name: "Is root", type: "boolean", internal: "root" },
          {
            id: "position",
            name: "Position in trace",
            type: "positionInTrace",
            internal: "position",
          },
          {
            id: "metadata",
            name: "Metadata",
            type: "stringObject",
            internal: "metadata",
          },
          {
            id: "environment",
            name: "Environment",
            type: "stringOptions",
            internal: "environment",
            options: [
              { value: "prod", displayValue: "Production" },
              { value: "staging" },
            ],
          },
          {
            id: "tags",
            name: "Tags",
            type: "arrayOptions",
            internal: "tags",
            allowCustomValues: true,
            options: [{ value: "chat" }, { value: "evaluation" }],
          },
          {
            id: "custom-score",
            name: "Custom score",
            type: "numberObject",
            internal: "custom-score",
          },
          {
            id: "numeric",
            name: "Scores (numeric)",
            type: "numberObject",
            internal: "numeric",
            keyOptions: ["Latency", "Accuracy"],
          },
          {
            id: "categorical",
            name: "Scores (categorical)",
            type: "categoryOptions",
            internal: "categorical",
            options: [
              { label: "Quality", values: ["Good", "Poor"] },
              { label: "Tone", values: ["Formal", "Casual"] },
            ],
          },
          {
            id: "boolean",
            name: "Scores (boolean)",
            type: "booleanObject",
            internal: "boolean",
            keyOptions: ["Passed"],
          },
          {
            id: "name",
            name: "Name",
            type: "string",
            internal: "internalValue",
          },
        ]}
      />
    );
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /^Filter runs/ }),
    );
  },
});

export const IconTrigger = meta.story({ args: { initialValue: [] } });

export const ObservationFilters = meta.story({
  args: {
    initialValue: [
      { column: "Tokens", type: "number", operator: ">=", value: 100 },
      {
        column: "Start time",
        type: "datetime",
        operator: ">=",
        value: new Date("2026-11-25T12:00:00Z"),
      },
      { column: "Is root", type: "boolean", operator: "=", value: true },
      {
        column: "Position in trace",
        type: "positionInTrace",
        operator: "=",
        key: "nthFromStart",
        value: 2,
      },
      {
        column: "Tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["custom-tag"],
      },
    ],
  },
});

export const Metadata = meta.story({
  args: {
    initialValue: [
      {
        column: "Metadata",
        type: "stringObject",
        key: "region",
        operator: "=",
        value: "eu-west",
      },
      {
        column: "Metadata",
        type: "stringObject",
        key: "tier",
        operator: "is set",
        value: "",
      },
    ],
  },
});

export const Text = meta.story({
  args: {
    initialValue: [
      { column: "Name", type: "string", operator: "contains", value: "chat" },
    ],
  },
});

export const TextWithoutValue = meta.story({
  args: {
    initialValue: [
      { column: "Name", type: "string", operator: "is not empty", value: "" },
    ],
  },
});

export const StringOptions = meta.story({
  args: {
    initialValue: [
      {
        column: "Environment",
        type: "stringOptions",
        operator: "any of",
        value: ["prod"],
      },
    ],
  },
});

export const ArrayOptions = meta.story({
  args: {
    initialValue: [
      {
        column: "Tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["chat", "evaluation"],
      },
    ],
  },
});

export const NumericScore = meta.story({
  args: {
    initialValue: [
      {
        column: "Scores (numeric)",
        type: "numberObject",
        key: "Latency",
        operator: "<",
        value: 1.5,
      },
    ],
  },
});

export const FreeTextScoreKey = meta.story({
  args: {
    initialValue: [
      {
        column: "Custom score",
        type: "numberObject",
        key: "Relevance",
        operator: ">=",
        value: 0.8,
      },
    ],
  },
});

export const CategoricalScore = meta.story({
  args: {
    initialValue: [
      {
        column: "Scores (categorical)",
        type: "categoryOptions",
        key: "Quality",
        operator: "any of",
        value: ["Good"],
      },
    ],
  },
});

export const BooleanScore = meta.story({
  args: {
    initialValue: [
      {
        column: "Scores (boolean)",
        type: "booleanObject",
        key: "Passed",
        operator: "=",
        value: false,
      },
    ],
  },
});
