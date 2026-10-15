import { type AgentSessionProjection } from "@langfuse/shared";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Badge } from "@/src/components/design-system/Badge/Badge";

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
    <div className="shrink-0 px-4 pb-2">
      <Accordion type="single" collapsible>
        <Accordion.Item value="coverage">
          <Accordion.Trigger size="sm">
            <span className="flex flex-wrap items-center gap-2 text-xs font-normal">
              <span>Data coverage</span>
              {limited ? (
                <Badge color="yellow" text="Partial coverage" />
              ) : (
                <span className="text-muted-foreground">Bounded preview</span>
              )}
              {(coverage.missingSessionTraces > 0 ||
                coverage.incompleteSessions > 0 ||
                coverage.unlinkedObservations > 0) && (
                <span className="text-muted-foreground">
                  {coverage.missingSessionTraces} sessionless ·{" "}
                  {coverage.incompleteSessions} incomplete ·{" "}
                  {coverage.unlinkedObservations} unlinked
                </span>
              )}
            </span>
          </Accordion.Trigger>
          <Accordion.Content>
            <p className="text-muted-foreground py-2 text-xs">
              {coverage.missingSessionTraces} sessionless traces ·{" "}
              {coverage.incompleteSessions} incomplete session contexts ·{" "}
              {coverage.unlinkedObservations} observations without session or
              trace IDs.{" "}
              {limited &&
                "Some results reached a query limit or history boundary; rankings and comparisons are limited to the returned cohort. "}
              Skill evidence distinguishes native references from legacy tool
              matching. Native aggregation can replace this read model.
            </p>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
