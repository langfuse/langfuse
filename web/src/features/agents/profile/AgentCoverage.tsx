import { type AgentSessionProjection } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";

export function AgentCoverage({
  coverage,
}: {
  coverage: AgentSessionProjection["coverage"];
}) {
  const limited =
    coverage.agentsTruncated ||
    coverage.sessionsTruncated ||
    coverage.rowsTruncated ||
    coverage.groupsTruncated ||
    !coverage.historyComplete;
  return (
    <div className="px-4 pb-3">
      <Alert variant="info">
        <Alert.Title>
          {limited
            ? "Bounded preview · partial coverage"
            : "Bounded event preview"}
        </Alert.Title>
        <Alert.Description>
          <span className="text-xs">
            {coverage.missingSessionTraces} sessionless traces ·{" "}
            {coverage.incompleteSessions} incomplete session contexts ·{" "}
            {coverage.unlinkedObservations} observations without session or
            trace IDs.{" "}
            {limited &&
              "Some results reached a query limit or history boundary; rankings and comparisons are limited to the returned cohort. "}
            Skill evidence distinguishes native references from legacy tool
            matching. Native aggregation can replace this read model.
          </span>
        </Alert.Description>
      </Alert>
    </div>
  );
}
