import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { numberFormatter } from "@/src/utils/numbers";
import { type Observation } from "@langfuse/shared";

export const AggUsageBadge = (props: {
  observations: ObservationReturnType[];
  rightIcon?: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline" | "tertiary";
}) => {
  const usage = {
    inputUsage: props.observations
      .map((o) => o.inputUsage)
      .reduce((a, b) => a + b, 0),
    outputUsage: props.observations
      .map((o) => o.outputUsage)
      .reduce((a, b) => a + b, 0),
    totalUsage: props.observations
      .map((o) => o.totalUsage)
      .reduce((a, b) => a + b, 0),
  };
  return (
    <TokenUsageBadge
      {...usage}
      rightIcon={props.rightIcon}
      variant={props.variant}
    />
  );
};

export const TokenUsageBadge = (
  props: (
    | {
        observation: Observation;
      }
    | {
        inputUsage: number;
        outputUsage: number;
        totalUsage: number;
      }
  ) & {
    inline?: boolean;
    rightIcon?: React.ReactNode;
    variant?: "default" | "secondary" | "destructive" | "outline" | "tertiary";
  },
) => {
  const usage =
    "observation" in props
      ? {
          inputUsage: props.observation.inputUsage,
          outputUsage: props.observation.outputUsage,
          totalUsage: props.observation.totalUsage,
        }
      : props;

  if (
    usage.inputUsage === 0 &&
    usage.outputUsage === 0 &&
    usage.totalUsage === 0
  )
    return <></>;

  const content = `${numberFormatter(usage.inputUsage, 0)} → ${numberFormatter(usage.outputUsage, 0)} (∑ ${numberFormatter(usage.totalUsage, 0)})`;

  if (props.inline)
    return (
      <span className="flex items-center gap-1">
        {content}
        {props.rightIcon}
      </span>
    );

  return (
    <Badge variant={props.variant ?? "outline"}>
      <span className="flex items-center gap-1">
        {content}
        {props.rightIcon}
      </span>
    </Badge>
  );
};
