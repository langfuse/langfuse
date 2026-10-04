import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { ScoreConfigsTable } from "./ScoreConfigsTable";

const actions = {
  createAction: {
    disabled: undefined,
    loading: false,
    onClick: fn(),
  },
  editAction: {
    disabled: undefined,
    openDialog: fn(),
  },
  archiveAction: {
    disabled: undefined,
    openDialog: fn(),
  },
  pagination: {
    mode: "offset" as const,
    totalCount: 2,
    state: { pageIndex: 0, pageSize: 50 },
    onChange: fn(),
  },
};

const meta = preview.meta({ component: ScoreConfigsTable });

export const Default = meta.story({
  args: {
    ...actions,
    data: {
      status: "success",
      data: [
        {
          id: "config-1",
          name: "Correctness",
          dataType: "NUMERIC",
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-01"),
          range: { minValue: 0, maxValue: 1 },
          description: "Measures whether the response is correct",
          isArchived: false,
        },
        {
          id: "config-2",
          name: "Sentiment",
          dataType: "CATEGORICAL",
          createdAt: new Date("2026-09-02"),
          updatedAt: new Date("2026-09-02"),
          range: {
            categories: [
              { value: 0, label: "Negative" },
              { value: 1, label: "Positive" },
            ],
          },
          description: null,
          isArchived: true,
        },
      ],
    },
  },
});

export const Loading = meta.story({
  args: {
    ...actions,
    data: { status: "loading" },
    pagination: { ...actions.pagination, totalCount: null },
  },
});

export const Empty = meta.story({
  args: {
    ...actions,
    data: { status: "success", data: [] },
    pagination: { ...actions.pagination, totalCount: 0 },
  },
});

export const Error = meta.story({
  args: {
    ...actions,
    data: { status: "error", error: "Failed to load score configs" },
    pagination: { ...actions.pagination, totalCount: null },
  },
});
