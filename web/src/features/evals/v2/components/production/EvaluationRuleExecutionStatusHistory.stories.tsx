import preview from "../../../../../../.storybook/preview";
import {
  EvaluationRuleExecutionStatusHistory,
  EvaluationRuleExecutionTraceStatusHistory,
} from "./EvaluationRuleExecutionStatusHistory";

const meta = preview.meta({ component: EvaluationRuleExecutionStatusHistory });

export const ExecutionStatuses = meta.story({
  args: {
    executions: [
      {
        id: "run-1",
        status: "COMPLETED",
        updatedAt: new Date("2026-07-01T10:00:00Z"),
        executionTraceId: "trace-1",
        jobConfiguration: { scoreName: "quality" },
      },
      {
        id: "run-2",
        status: "ERROR",
        updatedAt: new Date("2026-07-01T11:00:00Z"),
        executionTraceId: null,
        jobConfiguration: { scoreName: "quality" },
      },
    ],
  },
});

export const TraceStatuses = meta.story({
  render: () => (
    <EvaluationRuleExecutionTraceStatusHistory
      traces={[
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
      ]}
    />
  ),
});
