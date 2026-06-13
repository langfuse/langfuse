import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AutocompleteListbox } from "./AutocompleteListbox";
import type { CompletionPlan } from "@/src/features/search-bar/lib/completions";

const meta = preview.meta({
  component: AutocompleteListbox,
  args: {
    highlightedId: null,
    onPick: fn(),
    onHighlight: fn(),
  },
});

const fieldPlan: CompletionPlan = {
  stage: "field",
  from: 0,
  to: 3,
  loading: false,
  sections: [
    {
      title: "Fields",
      options: [
        {
          id: "field:level",
          kind: "field",
          label: "level",
          detail: "Observation level",
          fieldId: "level",
        },
        {
          id: "field:latency",
          kind: "field",
          label: "latency",
          detail: "Observation latency in seconds",
          fieldId: "latency",
        },
      ],
    },
    {
      title: "Patterns",
      options: [
        {
          id: "pat:anyof",
          kind: "pattern",
          label: "field:(a OR b)",
          detail: "any of",
          insert: "level:(ERROR OR WARNING)",
        },
      ],
    },
  ],
};

const valuePlan: CompletionPlan = {
  stage: "value",
  from: 6,
  to: 6,
  loading: false,
  sections: [
    {
      title: "Observed values",
      options: [
        {
          id: "value:ERROR",
          kind: "value",
          label: "ERROR",
          detail: "23",
          value: "ERROR",
          active: true,
        },
        {
          id: "value:WARNING",
          kind: "value",
          label: "WARNING",
          detail: "28",
          value: "WARNING",
        },
      ],
    },
    {
      title: "Match operators",
      options: [
        {
          id: "vop:~",
          kind: "operator",
          label: "~",
          detail: "contains — e.g. level:~refund",
          insert: "~",
        },
      ],
    },
  ],
};

export const Fields = meta.story({
  args: { plan: fieldPlan, highlightedId: "field:level" },
});

export const ObservedValues = meta.story({
  args: { plan: valuePlan },
});

export const Loading = meta.story({
  args: {
    plan: { stage: "value", from: 6, to: 6, loading: true, sections: [] },
  },
});

export const Empty = meta.story({
  args: {
    plan: { stage: "value", from: 0, to: 0, loading: false, sections: [] },
  },
});
