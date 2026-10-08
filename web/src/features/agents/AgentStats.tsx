import { type AgentMetrics, type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";

export function AgentStats(input: {
  projectId: string;
  agentName: string;
  from: Date;
  to: Date;
  filter: FilterState;
}) {
  const query = api.agents.byNameFromEvents.useQuery(input, {
    trpc: { context: { skipBatch: true } },
  });
  if (query.isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <Alert.Title>Statistics could not be loaded</Alert.Title>
          <Alert.Description>
            <Button
              text="Retry"
              variant="secondary"
              onClick={() => {
                query.refetch();
              }}
            />
          </Alert.Description>
        </Alert>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div
        aria-label="Loading agent statistics"
        className="grid shrink-0 grid-cols-2 gap-4 p-4 sm:grid-cols-3 xl:grid-cols-6"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    );
  }
  return <AgentStatsView metrics={query.data} />;
}

function AgentStatsView({ metrics }: { metrics: AgentMetrics }) {
  const items = [
    {
      label: "Traces",
      value: compactNumberFormatter(metrics.totalTraces),
      description: "Distinct traces containing this agent.",
    },
    {
      label: "Runs",
      value: compactNumberFormatter(metrics.totalRuns),
      description: "Agent observations carrying this name.",
    },
    {
      label: "Observations",
      value: compactNumberFormatter(metrics.totalObservations),
      description: "All observation types carrying this name.",
    },
    {
      label: "Total tokens",
      value: compactNumberFormatter(metrics.totalTokens),
      description: "Tokens on observations carrying this name.",
    },
    {
      label: "Total cost",
      value: usdFormatter(metrics.sumCalculatedTotalCost),
      description:
        "Exclusive cost of named observations; sub-agent cost is excluded.",
    },
    {
      label: "Avg. cost / trace",
      value:
        metrics.totalTraces > 0n
          ? usdFormatter(metrics.averageCostPerTrace)
          : "—",
      description:
        "Total exclusive cost divided by distinct traces, not by agent runs.",
    },
  ];
  return (
    <section
      aria-label="Agent statistics for the selected window"
      className="shrink-0 p-4"
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {items.map(({ label, value, description }) => (
          <div key={label} title={description}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          First seen in window: {metrics.firstSeen?.toLocaleString() ?? "—"}
        </span>
        <span>
          Last seen in window: {metrics.lastSeen?.toLocaleString() ?? "—"}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Cost and tokens include only observations carrying this agent name.
        Propagate the name to generations and tools; sub-agent cost is excluded.
      </p>
      {metrics.totalObservations === 0n && (
        <p className="mt-2 text-sm">
          No activity for this agent in the selected window. Choose a wider time
          range to explore earlier runs.
        </p>
      )}
    </section>
  );
}
