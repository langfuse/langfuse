import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip/Tooltip";

const EXPLANATION: Record<NotRecordedMetricProps["metric"], string> = {
  cost: "No cost was recorded for this run. Cost is derived from the token usage and model pricing its calls reported.",
  latency:
    "No latency was recorded for this run. Latency is derived from the start and end times its spans reported.",
};

type NotRecordedMetricProps = { metric: "cost" | "latency" };

/**
 * A bare `0` or `-` for cost or latency reads as broken instrumentation, so name
 * what is missing instead.
 */
export const NotRecordedMetric = ({ metric }: NotRecordedMetricProps) => (
  <Tooltip label={EXPLANATION[metric]}>
    {({ getTriggerProps }) => (
      <span
        {...getTriggerProps()}
        className="text-muted-foreground/70 cursor-default"
      >
        not recorded
      </span>
    )}
  </Tooltip>
);
