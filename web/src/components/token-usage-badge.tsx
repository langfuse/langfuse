import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
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
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
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
        {usage.promptTokens} → {usage.completionTokens} (∑ {usage.totalTokens})
      </span>
    );

  return (
    <Badge variant="outline">
      {usage.promptTokens} → {usage.completionTokens} (∑ {usage.totalTokens})
    </Badge>
  );
};
