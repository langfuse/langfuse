import type { TopicFacet } from "@langfuse/shared/topics";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { topicWindowLabel, type TopicAnalysisMap } from "./topic-maps";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import { executionLabels } from "./topic-run-labels";

type Change = "new" | "grown" | "shrunk" | "gone" | "stable";
const changeBadge: Record<
  Change,
  { text: string; color: "green" | "blue" | "yellow" | "red" | "filled" }
> = {
  new: { text: "New", color: "green" },
  grown: { text: "Grown", color: "blue" },
  shrunk: { text: "Shrunk", color: "yellow" },
  gone: { text: "Gone", color: "red" },
  stable: { text: "Stable", color: "filled" },
};
const percent = (share: number) => `${Math.round(share * 1000) / 10}%`;

/** An analysis's runs, newest first, and how the selected run differs from the one it reran. */
export function TopicAnalysisRuns({
  projectId,
  analysis,
  runId,
  facets,
  onSelectRun,
}: {
  projectId: string;
  analysis: TopicAnalysisMap;
  runId: string;
  facets: TopicFacet[];
  onSelectRun: (runId: string) => void;
}) {
  const diff = api.topics.analysisDiff.useQuery({
    projectId,
    executionId: runId,
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 md:flex-row">
      <ol className="flex shrink-0 flex-col gap-1 md:w-72">
        {analysis.runs.map((run, index) => (
          <li key={run.executionId}>
            <button
              type="button"
              onClick={() => onSelectRun(run.executionId)}
              aria-current={run.executionId === runId}
              className={cn(
                "hover:bg-accent flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm",
                run.executionId === runId && "border-border-contrast bg-muted",
              )}
            >
              <span className="font-bold">
                Run {analysis.runs.length - index} ·{" "}
                {topicWindowLabel(run.timeRange)}
              </span>
              <span className="text-muted-foreground text-xs">
                {run.traceCount.toLocaleString("en-US")} traces ·{" "}
                {executionLabels[run.status]}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        {diff.error ? (
          <TopicsErrorMessage message={diff.error.message} />
        ) : null}
        <RunDiff diff={diff.data} pending={diff.isPending} facets={facets} />
      </section>
    </div>
  );
}

type Diff = RouterOutputs["topics"]["analysisDiff"] | undefined;

function RunDiff({
  diff,
  pending,
  facets,
}: {
  diff: Diff;
  pending: boolean;
  facets: TopicFacet[];
}) {
  if (pending) return <p className="text-sm">Comparing runs…</p>;
  if (!diff?.previousExecutionId)
    return (
      <p className="text-muted-foreground text-sm">
        This is the first run. Rerun the analysis on a new window to see which
        topics are new, grew, shrank or are gone.
      </p>
    );
  if (diff.facets.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Both runs need published topics before they can be compared.
      </p>
    );
  return (
    <>
      <p className="text-muted-foreground text-sm">
        Compared with the run over{" "}
        {diff.previousTimeRange
          ? topicWindowLabel(diff.previousTimeRange)
          : "the previous window"}
        . Shares are compared, not counts, because windows can hold different
        numbers of traces.
      </p>
      {diff.facets.map((facet) => (
        <div key={facet.facetId} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">
            {facets.find((item) => item.id === facet.facetId)?.name ?? "Facet"}
          </h3>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-1 font-normal">Topic</th>
                <th className="py-1 text-right font-normal">Before</th>
                <th className="py-1 text-right font-normal">Now</th>
                <th className="py-1 pl-3 font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {facet.topics.map((topic) => (
                <tr key={topic.topicId} className="border-t">
                  <td className="py-1.5 pr-3">{topic.name}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {percent(topic.previousShare)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {percent(topic.currentShare)}
                  </td>
                  <td className="py-1.5 pl-3">
                    <Badge size="sm" {...changeBadge[topic.change]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
