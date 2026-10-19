import { useState, type ReactNode } from "react";
import {
  type AgentProjectionSummary,
  type AgentProjectionWindow,
} from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { numberFormatter } from "@/src/utils/numbers";

const rangeLabel = (from: Date, to: Date) =>
  `${from.toLocaleString()} – ${to.toLocaleString()}`;
const meanLabel = (value: number | null) =>
  value === null ? "—" : numberFormatter(value, 1);
const SIGNAL_LABELS = {
  "tool-change": "tool change",
  "missing-tools": "missing tools",
  "cost-outlier": "cost outlier",
  "runtime-outlier": "runtime outlier",
  "steps-outlier": "steps outlier",
};

export function AgentComparisonView({
  agent,
  recentWindow,
  baselineWindow,
  chart,
  onSelectSignal,
}: {
  agent: Pick<
    AgentProjectionSummary,
    "baseline" | "recent" | "comparisonStatus" | "excludedSessions" | "signals"
  > | null;
  recentWindow: AgentProjectionWindow;
  baselineWindow: AgentProjectionWindow;
  chart: ReactNode;
  onSelectSignal: (kind: string) => void;
}) {
  const [expanded, setExpanded] = useState("");
  const ready = agent?.comparisonStatus === "ready";
  const statusLabel = {
    ready: "Historical comparison",
    "incomplete-cohort": "Incomplete cohort",
    "insufficient-data": "Insufficient sessions",
  }[agent?.comparisonStatus ?? "insufficient-data"];
  return (
    <section
      aria-label="Tools per session comparison"
      className="bg-muted/20 min-w-0 rounded-md px-3"
    >
      <Accordion
        type="single"
        collapsible
        value={expanded}
        onValueChange={setExpanded}
      >
        <Accordion.Item value="details">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
            <h2 className="text-xs font-bold">Tools per session</h2>
            <div className="flex items-baseline gap-1.5 text-xs">
              <span className="text-muted-foreground">Recent</span>
              <span className="font-mono font-bold">
                {meanLabel(agent?.recent.averageToolsPerSession ?? null)}
              </span>
              <span className="text-muted-foreground">
                · {agent?.recent.completeSessions ?? 0} qualifying sessions
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 text-xs">
              <span className="text-muted-foreground">Baseline</span>
              <span className="font-mono font-bold">
                {meanLabel(agent?.baseline.averageToolsPerSession ?? null)}
              </span>
              <span className="text-muted-foreground">
                · {agent?.baseline.completeSessions ?? 0} qualifying sessions
              </span>
            </div>
            <Badge color={ready ? "filled" : "yellow"} text={statusLabel} />
            <Accordion.Trigger size="sm">Comparison details</Accordion.Trigger>
          </div>
          {agent && agent.signals.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1.5">
              {agent.signals.map((signal) => (
                <Button
                  key={signal.kind}
                  text={`Inspect ${SIGNAL_LABELS[signal.kind]}`}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setExpanded("");
                    onSelectSignal(signal.kind);
                  }}
                />
              ))}
            </div>
          )}
          <Accordion.Content>
            <div className="flex flex-col gap-3 pt-2 pb-3">
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-bold">Recent window</dt>
                  <dd className="text-muted-foreground">
                    {rangeLabel(recentWindow.from, recentWindow.to)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold">Baseline window</dt>
                  <dd className="text-muted-foreground">
                    {rangeLabel(baselineWindow.from, baselineWindow.to)}
                  </dd>
                </div>
              </dl>
              <p className="text-muted-foreground text-xs">
                Includes zero-tool sessions. Comparisons use settled observed
                sessions; a change is a prompt to investigate, not a quality
                score. Times use your browser&apos;s timezone.
              </p>
              {(agent?.excludedSessions ?? 0) > 0 && (
                <p className="text-muted-foreground text-xs">
                  {agent?.excludedSessions} open or incomplete session contexts
                  excluded from comparisons.
                </p>
              )}
              {agent && agent.signals.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs">
                  {agent.signals.map((signal) => (
                    <li key={signal.kind}>{signal.message}</li>
                  ))}
                </ul>
              )}
              {chart}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </section>
  );
}
