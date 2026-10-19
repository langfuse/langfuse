import {
  type AgentProjectionTool,
  type AgentSessionProjection,
} from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { BarChart } from "@/src/components/design-system/charts/BarChart/BarChart";

function prepareToolContext(tools: AgentProjectionTool[]) {
  const executed = tools.filter((tool) => tool.invocations > 0);
  return {
    executedCount: executed.length,
    chart: [...executed]
      .sort((a, b) => b.invocations - a.invocations)
      .slice(0, 8)
      .map((tool) => ({ label: tool.name, value: tool.invocations })),
    availableNames: tools
      .filter((tool) => tool.available)
      .map((tool) => tool.name),
  };
}

export function AgentToolsContext({
  agentName,
  projection,
}: {
  agentName: string;
  projection: AgentSessionProjection;
}) {
  const { chart, executedCount, availableNames } = prepareToolContext(
    projection.tools.filter((tool) => tool.agentName === agentName),
  );
  return (
    <section aria-label="Tool context" className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-bold">Tool execution</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Executed TOOL observations include skill-loading tools. Model
          tool-call requests are not added to executed calls.
        </p>
      </div>
      {chart.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            Top {chart.length} of {executedCount} tools by executed calls
          </p>
          <div className="ph-no-capture h-40">
            <BarChart
              data={chart}
              ariaLabel="Most frequently executed tools"
              tooltipValueLabel="Executed calls"
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No tool executions were observed in the selected window.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold">Available tool declarations</h3>
        {availableNames.length > 0 ? (
          <div className="ph-no-capture flex flex-wrap gap-2">
            {availableNames.map((name) => (
              <Badge key={name} text={name} color="filled" />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            No available-tool definitions were observed in discovery history.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Declarations were observed during the bounded discovery lookback. They
          do not establish the current deployment&apos;s configuration or
          executed calls.
        </p>
      </div>
      {projection.coverage.groupsTruncated && (
        <p className="text-muted-foreground text-xs">
          Tool groups and declarations may be incomplete; the projection is
          limited to {projection.coverage.groupsLimit} groups per agent.
        </p>
      )}
    </section>
  );
}
