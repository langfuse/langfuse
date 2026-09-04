import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostBadge } from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";

type TraceSummaryBarProps = {
  projectId: string;
  latencySeconds: number | null;
  sessionId: string | null | undefined;
  userId: string | null | undefined;
  totalCost: number | null;
  costDetails: Record<string, number> | undefined;
};

export function TraceSummaryBar({
  projectId,
  latencySeconds,
  sessionId,
  userId,
  totalCost,
  costDetails,
}: TraceSummaryBarProps) {
  return (
    <div className="bg-muted/20 @container shrink-0 border-b px-2 py-1.5">
      <p className="text-muted-foreground mb-1 text-xs">Trace summary</p>
      <CollapsibleBadgeRow>
        <LatencyBadge latencySeconds={latencySeconds} />
        <SessionBadge sessionId={sessionId ?? null} projectId={projectId} />
        <UserIdBadge userId={userId ?? null} projectId={projectId} />
        {totalCost != null && costDetails ? (
          <CostBadge totalCost={totalCost} costDetails={costDetails} />
        ) : null}
      </CollapsibleBadgeRow>
    </div>
  );
}
