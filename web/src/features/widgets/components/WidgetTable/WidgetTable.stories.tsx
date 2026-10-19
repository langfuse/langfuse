import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DashboardWidgetTable } from "./WidgetTable";

const onCopy = fn();

const meta = preview.meta({
  component: DashboardWidgetTable,
});

export const Default = meta.story({
  args: {
    projectId: "project-1",
    hasCUDAccess: true,
    onCopy,
    onDelete: fn(),
    onDownload: fn(),
    onDuplicate: fn(),
    data: {
      status: "success",
      data: [
        {
          id: "widget-1",
          name: "Trace count",
          description: "Daily trace volume",
          view: "TRACES",
          chartType: "LINE_TIME_SERIES",
          owner: "PROJECT",
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-2",
          name: "Observation volume",
          description: "Observation volume over time",
          view: "OBSERVATIONS",
          chartType: "AREA_TIME_SERIES",
          owner: "PROJECT",
          createdAt: new Date("2026-09-02"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-3",
          name: "Numeric score trend",
          description: "Numeric scores over time",
          view: "SCORES_NUMERIC",
          chartType: "BAR_TIME_SERIES",
          owner: "PROJECT",
          createdAt: new Date("2026-09-03"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-4",
          name: "Boolean score totals",
          description: "Boolean scores by value",
          view: "SCORES_BOOLEAN",
          chartType: "HORIZONTAL_BAR",
          owner: "PROJECT",
          createdAt: new Date("2026-09-04"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-5",
          name: "Categorical score distribution",
          description: "Categorical scores by value",
          view: "SCORES_CATEGORICAL",
          chartType: "VERTICAL_BAR",
          owner: "PROJECT",
          createdAt: new Date("2026-09-05"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-6",
          name: "Trace distribution",
          description: "Traces by category",
          view: "TRACES",
          chartType: "PIE",
          owner: "PROJECT",
          createdAt: new Date("2026-09-06"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-7",
          name: "Observation count",
          description: "Total observations",
          view: "OBSERVATIONS",
          chartType: "NUMBER",
          owner: "PROJECT",
          createdAt: new Date("2026-09-07"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-8",
          name: "Score histogram",
          description: "Numeric score distribution",
          view: "SCORES_NUMERIC",
          chartType: "HISTOGRAM",
          owner: "PROJECT",
          createdAt: new Date("2026-09-08"),
          updatedAt: new Date("2026-09-18"),
        },
        {
          id: "widget-9",
          name: "Boolean score matrix",
          description: "Boolean scores grouped by dimension",
          view: "SCORES_BOOLEAN",
          chartType: "PIVOT_TABLE",
          owner: "PROJECT",
          createdAt: new Date("2026-09-09"),
          updatedAt: new Date("2026-09-18"),
        },
      ],
    },
  },
});
