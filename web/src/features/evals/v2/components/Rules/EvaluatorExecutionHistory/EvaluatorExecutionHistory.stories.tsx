import preview from "../../../../../../../.storybook/preview";
import { EvaluatorExecutionHistory } from "./EvaluatorExecutionHistory";

const meta = preview.meta({ component: EvaluatorExecutionHistory });

export const Runs = meta.story({
  args: {
    traces: [
      {
        id: "trace-1",
        level: "DEFAULT",
        timestamp: new Date("2026-07-01T10:00:00Z"),
      },
      {
        id: "trace-2",
        level: "WARNING",
        timestamp: new Date("2026-07-01T11:00:00Z"),
      },
      {
        id: "trace-3",
        level: "ERROR",
        timestamp: new Date("2026-07-01T12:00:00Z"),
      },
    ],
  },
});

export const NoRuns = meta.story({
  args: { traces: [] },
});
