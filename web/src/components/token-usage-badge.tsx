import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { numberFormatter } from "@/src/utils/numbers";
import { type Observation } from "@langfuse/shared";

export const TraceAggUsageBadge = (props: {
  observations: ObservationReturnType[];
}) => {
  const usage = {
    promptTokens: props.observations
      .map((o) => o.promptTokens)
      .reduce((a, b) => a + b, 0),
    completionTokens: props.observations
      .map((o) => o.completionTokens)
      .reduce((a, b) => a + b, 0),
    totalTokens: props.observations
      .map((o) => o.totalTokens)
      .reduce((a, b) => a + b, 0),
  };
  return <TokenUsageBadge {...usage} />;
};

export const TokenUsageBadge = (
  props: (
    | {
        observation: Observation;
      }
    | {
        promptTokens: number | bigint;
        completionTokens: number | bigint;
        totalTokens: number | bigint;
      }
  ) & {
    inline?: boolean;
  },
) => {
  const usage =
    "observation" in props
      ? {
          promptTokens: props.observation.promptTokens,
          completionTokens: props.observation.completionTokens,
          totalTokens: props.observation.totalTokens,
        }
      : props;

  if (
    usage.promptTokens === 0 &&
    usage.completionTokens === 0 &&
    usage.totalTokens === 0
  )
    return <></>;

  if (props.inline)
    return (
      <span>
        {`${numberFormatter(usage.promptTokens, 0)} → ${numberFormatter(usage.completionTokens, 0)} (∑ ${numberFormatter(usage.totalTokens, 0)})`}
      </span>
    );

  return (
    <Badge variant="outline">
      {`${numberFormatter(usage.promptTokens, 0)} → ${numberFormatter(usage.completionTokens, 0)} (∑ ${numberFormatter(usage.totalTokens, 0)})`}
    </Badge>
  );
};
