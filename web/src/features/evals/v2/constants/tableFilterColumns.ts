import { EvalTemplateType, type ColumnDefinition } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

const evaluatorStatusOptions = [
  { value: "ACTIVE", displayValue: "Active" },
  { value: "INACTIVE", displayValue: "Inactive" },
  { value: "BLOCKED", displayValue: "Blocked" },
];

const evaluatorTypeOptions = [
  {
    value: EvalTemplateType.LLM_AS_JUDGE,
    displayValue: "LLM as a judge",
  },
  { value: EvalTemplateType.CODE, displayValue: "Code" },
];

export const evaluatorTableFilterColumns: ColumnDefinition[] = [
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [],
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "status",
    options: evaluatorStatusOptions,
  },
  {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: "type",
    options: evaluatorTypeOptions,
  },
  {
    name: "Model",
    id: "model",
    type: "stringOptions",
    internal: "model",
    options: [],
  },
  {
    name: "Creator",
    id: "creator",
    type: "stringOptions",
    internal: "creator",
    options: [],
  },
];

export const evaluationRuleTableFilterColumns: ColumnDefinition[] = [
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [],
  },
  {
    name: "Creator",
    id: "creator",
    type: "stringOptions",
    internal: "creator",
    options: [],
  },
  {
    name: "Enabled",
    id: "enabled",
    type: "boolean",
    internal: "enabled",
  },
  {
    name: "Upgrade required",
    id: "upgradeRequired",
    type: "boolean",
    internal: "upgradeRequired",
  },
];

export const evaluatorTableFilterConfig: FilterConfig = {
  tableName: "evaluators-v2",
  columnDefinitions: evaluatorTableFilterColumns,
  defaultExpanded: ["status", "type"],
  facets: [
    { type: "categorical", column: "name", label: "Name" },
    { type: "categorical", column: "status", label: "Status" },
    { type: "categorical", column: "type", label: "Type" },
    { type: "categorical", column: "model", label: "Model" },
    { type: "categorical", column: "creator", label: "Creator" },
  ],
};

export const evaluationRuleTableFilterConfig: FilterConfig = {
  tableName: "evaluation-rules-v2",
  columnDefinitions: evaluationRuleTableFilterColumns,
  defaultExpanded: ["enabled"],
  facets: [
    { type: "categorical", column: "name", label: "Name" },
    { type: "categorical", column: "creator", label: "Creator" },
    {
      type: "boolean",
      column: "enabled",
      label: "Enabled",
      trueLabel: "Enabled",
      falseLabel: "Disabled",
    },
    {
      type: "boolean",
      column: "upgradeRequired",
      label: "Upgrade required",
      trueLabel: "Required",
      falseLabel: "Not required",
    },
  ],
};

export const evaluatorTableFilterOptions = {
  status: evaluatorStatusOptions,
  type: evaluatorTypeOptions,
};

export const evaluationRuleTableFilterOptions = {};
