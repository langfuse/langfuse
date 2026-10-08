import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import type {
  BooleanKeyValueFilterEntry,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  StringKeyValueFilterEntry,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import { KeyValueFilterBuilder } from "./KeyValueFilterBuilder";

const meta = preview.meta({ component: KeyValueFilterBuilder });

export const Categorical = meta.story({
  args: {
    mode: "categorical",
    keyOptions: ["quality", "relevance", "helpfulness"],
    keyLevels: { quality: ["trace"], relevance: ["observation"] },
    availableValues: {
      quality: ["good", "average", "poor"],
      relevance: ["high", "medium", "low"],
      helpfulness: ["yes", "no"],
    },
    activeFilters: [{ key: "quality", operator: "any of", value: ["good"] }],
    onChange: fn(),
  },
  render: (args) => {
    const [filters, setFilters] = useState<KeyValueFilterEntry[]>(
      args.activeFilters as KeyValueFilterEntry[],
    );
    return (
      <div className="w-80">
        <KeyValueFilterBuilder
          mode="categorical"
          keyOptions={args.keyOptions}
          keyLevels={args.keyLevels}
          availableValues={
            args.mode === "categorical" ? args.availableValues : {}
          }
          keyPlaceholder={args.keyPlaceholder}
          activeFilters={filters}
          onChange={setFilters}
        />
      </div>
    );
  },
});

export const Numeric = meta.story({
  args: {
    mode: "numeric",
    keyOptions: ["accuracy", "latency", "cost"],
    activeFilters: [{ key: "accuracy", operator: ">=", value: 0.8 }],
    onChange: fn(),
  },
  render: (args) => {
    const [filters, setFilters] = useState<NumericKeyValueFilterEntry[]>(
      args.activeFilters as NumericKeyValueFilterEntry[],
    );
    return (
      <div className="w-80">
        <KeyValueFilterBuilder
          mode="numeric"
          keyOptions={args.keyOptions}
          keyLevels={args.keyLevels}
          keyPlaceholder={args.keyPlaceholder}
          activeFilters={filters}
          onChange={setFilters}
        />
      </div>
    );
  },
});

export const Boolean = meta.story({
  args: {
    mode: "boolean",
    keyOptions: ["approved", "verified", "flagged"],
    activeFilters: [{ key: "approved", operator: "=", value: true }],
    onChange: fn(),
  },
  render: (args) => {
    const [filters, setFilters] = useState<BooleanKeyValueFilterEntry[]>(
      args.activeFilters as BooleanKeyValueFilterEntry[],
    );
    return (
      <div className="w-80">
        <KeyValueFilterBuilder
          mode="boolean"
          keyOptions={args.keyOptions}
          keyLevels={args.keyLevels}
          keyPlaceholder={args.keyPlaceholder}
          activeFilters={filters}
          onChange={setFilters}
        />
      </div>
    );
  },
});

export const String = meta.story({
  args: {
    mode: "string",
    keyOptions: ["environment", "region", "user.id"],
    keyDetails: {
      environment: "string",
      region: "string",
      "user.id": "string",
    },
    valueOptions: {
      environment: ["production", "staging", "development"],
      region: ["us-east-1", "eu-west-1"],
    },
    activeFilters: [{ key: "environment", operator: "=", value: "production" }],
    onChange: fn(),
  },
  render: (args) => {
    const [filters, setFilters] = useState<StringKeyValueFilterEntry[]>(
      args.activeFilters as StringKeyValueFilterEntry[],
    );
    return (
      <div className="w-80">
        <KeyValueFilterBuilder
          mode="string"
          keyOptions={args.keyOptions}
          keyDetails={args.mode === "string" ? args.keyDetails : undefined}
          valueOptions={args.mode === "string" ? args.valueOptions : undefined}
          keyPlaceholder={args.keyPlaceholder}
          activeFilters={filters}
          onChange={setFilters}
        />
      </div>
    );
  },
});

export const FreeFormKey = meta.story({
  args: {
    mode: "numeric",
    keyOptions: [],
    activeFilters: [{ key: "custom.metric", operator: ">=", value: 0.8 }],
    onChange: fn(),
  },
  render: (args) => {
    const [filters, setFilters] = useState<NumericKeyValueFilterEntry[]>(
      args.activeFilters as NumericKeyValueFilterEntry[],
    );
    return (
      <div className="w-80">
        <KeyValueFilterBuilder
          mode="numeric"
          keyOptions={args.keyOptions}
          activeFilters={filters}
          onChange={setFilters}
        />
      </div>
    );
  },
});

export const Empty = meta.story({
  args: {
    mode: "string",
    keyOptions: ["region"],
    valueOptions: { region: ["eu", "us"] },
    activeFilters: [],
    onChange: fn(),
  },
});

export const TestObservedKeySuggestionPreservesValue = meta.story({
  name: "(Test) Observed Key Suggestion Preserves Value",
  args: {
    mode: "string",
    keyOptions: ["environment", "region"],
    keyDetails: { environment: "string", region: "string" },
    valueOptions: { environment: ["production"], region: ["eu", "us"] },
    activeFilters: [{ key: "re", operator: "=", value: "production" }],
    onChange: fn(),
  },
  render: (args) => {
    const [filters, setFilters] = useState<StringKeyValueFilterEntry[]>(
      args.activeFilters as StringKeyValueFilterEntry[],
    );
    return (
      <div className="w-80">
        <KeyValueFilterBuilder
          mode="string"
          keyOptions={args.keyOptions}
          keyDetails={args.mode === "string" ? args.keyDetails : undefined}
          valueOptions={args.mode === "string" ? args.valueOptions : undefined}
          activeFilters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            if (args.mode === "string") {
              args.onChange(nextFilters);
            }
          }}
        />
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const key = canvas.getByPlaceholderText("Key");

    await userEvent.click(key);
    await userEvent.keyboard("{ArrowDown}{Enter}");

    await expect(key).toHaveValue("region");
    await expect(canvas.getByPlaceholderText("Value")).toHaveValue(
      "production",
    );
    await expect(args.onChange).toHaveBeenCalledWith([
      { key: "region", operator: "=", value: "production" },
    ]);
  },
});
