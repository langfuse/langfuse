import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostBadge } from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import {
  EnvironmentBadge,
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";

type TraceSummaryBarProps = {
  projectId: string;
  latencySeconds: number | null;
  sessionId: string | null | undefined;
  userId: string | null | undefined;
  environment: string | null | undefined;
  totalCost: number | null;
  costDetails: Record<string, number> | undefined;
};

export function TraceSummaryBar({
  projectId,
  latencySeconds,
  sessionId,
  userId,
  environment,
  totalCost,
  costDetails,
}: TraceSummaryBarProps) {
  return (
    <CollapsibleBadgeRow>
      <SessionBadge sessionId={sessionId ?? null} projectId={projectId} />
      <UserIdBadge userId={userId ?? null} projectId={projectId} />
      <EnvironmentBadge environment={environment ?? null} />
      <LatencyBadge latencySeconds={latencySeconds} />
      {totalCost != null && costDetails ? (
        <CostBadge totalCost={totalCost} costDetails={costDetails} />
      ) : null}
    </CollapsibleBadgeRow>
  );
}
