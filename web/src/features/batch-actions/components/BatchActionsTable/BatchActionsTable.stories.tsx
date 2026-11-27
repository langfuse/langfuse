import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { BatchActionsTable } from "./BatchActionsTable";

const meta = preview.meta({ component: BatchActionsTable });

export const Default = meta.story({
  args: {
    data: {
      status: "success",
      data: [
        {
          id: "batch-action-1",
          actionType: "add-to-dataset",
          tableName: "observations",
          status: "COMPLETED",
          totalCount: 10,
          processedCount: 10,
          failedCount: 0,
          createdAt: new Date("2026-09-01"),
          finishedAt: new Date("2026-09-02"),
          log: null,
          user: { name: "Ada Lovelace", image: null },
        },
        {
          id: "batch-action-2",
          actionType: "run-evaluation",
          tableName: "traces",
          status: "PARTIAL",
          totalCount: 5,
          processedCount: 4,
          failedCount: 1,
          createdAt: new Date("2026-09-03"),
          finishedAt: null,
          log: "One item failed",
          user: null,
        },
      ],
    },
    pagination: {
      mode: "offset",
      totalCount: 2,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
  },
});

export const Loading = meta.story({
  args: {
    data: { status: "loading" },
    pagination: {
      mode: "offset",
      totalCount: 0,
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
    },
  },
});
