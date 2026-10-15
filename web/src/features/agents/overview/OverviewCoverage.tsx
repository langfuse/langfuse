import { type AgentSessionProjection } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { coverageIncomplete } from "./prepareOverview";
export function OverviewCoverage({
  projection,
}: {
  projection: AgentSessionProjection;
}) {
  const c = projection.coverage;
  return (
    <div className="flex flex-col gap-2 text-xs">
      {coverageIncomplete(projection) && (
        <Alert variant="info">
          <Alert.Description>
            Bounded sample: up to {c.agentLimit} agents,{" "}
            {c.sessionLimit.toLocaleString()} sessions,{" "}
            {c.rowLimit.toLocaleString()} observations. Some results were
            truncated. Counts and rankings describe this sample.
          </Alert.Description>
        </Alert>
      )}
      <p className="text-muted-foreground">
        Observed agents · discovered{" "}
        {projection.discoveryWindow.from.toLocaleDateString()}–
        {projection.discoveryWindow.to.toLocaleDateString()} · activity in the
        selected window.{" "}
        {c.missingSessionTraces > 0 &&
          `${c.missingSessionTraces} traces have no session ID and appear separately.`}{" "}
        {c.incompleteSessions > 0 &&
          `${c.incompleteSessions} incomplete agent-session contexts are excluded from comparisons.`}
      </p>
      <p className="text-muted-foreground">
        Exclusive attribution from named observations. Invocation = AGENT span;
        session = distinct nonempty session ID. Skill evidence uses native
        references with a labelled tool-name fallback.{" "}
        {c.unlinkedObservations > 0 &&
          `${c.unlinkedObservations} observations have neither session nor trace IDs.`}
      </p>
    </div>
  );
}
