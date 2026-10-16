import Link from "next/link";
import { ZoomIn, ZoomOut, CalendarDays } from "lucide-react";
import {
  type AgentSessionProjection,
  type AgentProjectionSession,
} from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { AgentIdentity, useAgentAppearance } from "../appearance";
import {
  activityBuckets,
  formatDuration,
  prepareSessionBars,
  sessionPath,
  type OverviewAgent,
  type OverviewScope,
} from "./prepareOverview";

type ActivityProps = {
  agents: OverviewAgent[];
  scope: OverviewScope;
  projection: AgentSessionProjection;
  view: "timeline" | "heatmap";
  onViewChange: (view: "timeline" | "heatmap") => void;
  onZoom: (from: Date, to: Date, agentName?: string) => void;
};
function dateLabel(date: Date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function SessionPreview({
  row,
  scope,
  onZoom,
}: {
  row: AgentProjectionSession;
  scope: OverviewScope;
  onZoom: ActivityProps["onZoom"];
}) {
  const pad = Math.max(
    60_000,
    (row.lastSeen.getTime() - row.firstSeen.getTime()) * 0.2,
  );
  return (
    <div className="ph-no-capture flex w-72 flex-col gap-3 p-4">
      <AgentIdentity projectId={scope.projectId} agentName={row.agentName} />
      <div>
        <p
          className="truncate text-xs font-bold"
          title={row.sessionId ?? row.traceId ?? undefined}
        >
          {row.kind === "session" ? "Session" : "Trace without a session"} ·{" "}
          {row.sessionId ?? row.traceId}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {dateLabel(row.firstSeen)} – {dateLabel(row.lastSeen)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Agent tool calls</dt>
          <dd>{row.toolInvocations}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Observed agent time</dt>
          <dd>{formatDuration(row.agentObservedDurationMs)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Agent cost</dt>
          <dd>${row.cost.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Traces</dt>
          <dd>{row.traceCount}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">
        {row.completePerSession
          ? "Complete observed session cohort"
          : `Partial evidence: ${row.completenessReason}`}
        . Bar bounds are this agent’s observed activity.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href={sessionPath(scope, row)}
          className="text-primary text-xs hover:underline"
        >
          Open {row.kind} →
        </Link>
        <Button
          text="Zoom here"
          variant="ghost"
          size="sm"
          onClick={() =>
            onZoom(
              new Date(row.firstSeen.getTime() - pad),
              new Date(row.lastSeen.getTime() + pad),
              row.agentName,
            )
          }
        />
      </div>
    </div>
  );
}
function TimelineLane({
  agent,
  scope,
  projection,
  onZoom,
}: {
  agent: OverviewAgent;
  scope: OverviewScope;
  projection: AgentSessionProjection;
  onZoom: ActivityProps["onZoom"];
}) {
  const appearance = useAgentAppearance(scope.projectId, agent.agentName);
  const { bars, tracks } = prepareSessionBars(
    projection.sessions.filter((row) => row.agentName === agent.agentName),
    scope.from,
    scope.to,
  );
  return (
    <div className="flex min-h-16 border-t">
      <div className="flex w-44 shrink-0 flex-col justify-center gap-1 border-r px-3 py-3">
        <AgentIdentity
          projectId={scope.projectId}
          agentName={agent.agentName}
          size="sm"
        />
        <p className="text-muted-foreground text-[10px]">
          {bars.length
            ? `${bars.filter((bar) => bar.session.kind === "session").length} sessions · ${bars.filter((bar) => bar.session.kind === "trace").length} trace fallbacks`
            : "No activity in window"}
        </p>
      </div>
      <div
        className="relative min-w-0 flex-1 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px)] bg-size-[25%_100%]"
        style={{ height: Math.max(64, tracks * 19 + 24) }}
      >
        {bars.map(({ session, start, width, track }) => (
          <HoverCard
            key={session.id}
            content={
              <SessionPreview row={session} scope={scope} onZoom={onZoom} />
            }
            placement="top"
          >
            {({ getTriggerProps }) => (
              <Link
                {...getTriggerProps()}
                href={sessionPath(scope, session)}
                aria-label={`Open ${session.kind} ${session.sessionId ?? session.traceId}`}
                className="focus-visible:outline-ring absolute min-w-1 rounded-sm border hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  left: `${start * 100}%`,
                  width: `${width * 100}%`,
                  top: 12 + track * 19,
                  height: 13,
                  backgroundColor: `${appearance.color}${session.kind === "trace" ? "55" : "b3"}`,
                  borderColor: appearance.color,
                  borderStyle: session.kind === "trace" ? "dashed" : "solid",
                }}
              />
            )}
          </HoverCard>
        ))}
      </div>
    </div>
  );
}
function HeatmapLane({
  agent,
  scope,
  projection,
  onZoom,
}: {
  agent: OverviewAgent;
  scope: OverviewScope;
  projection: AgentSessionProjection;
  onZoom: ActivityProps["onZoom"];
}) {
  const appearance = useAgentAppearance(scope.projectId, agent.agentName);
  const buckets = activityBuckets(projection, agent.agentName, 48),
    max = Math.max(1, ...buckets.map((bucket) => bucket.count ?? 0));
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-40 shrink-0">
        <AgentIdentity
          projectId={scope.projectId}
          agentName={agent.agentName}
          size="sm"
        />
      </div>
      <div className="flex min-w-0 flex-1 gap-1">
        {buckets.map((bucket) => (
          <button
            key={bucket.from.getTime()}
            type="button"
            className="focus-visible:outline-ring h-8 min-w-2 flex-1 rounded-sm border transition-transform hover:z-1 hover:scale-110 focus-visible:outline-2"
            style={{
              backgroundColor: bucketColor(appearance.color, bucket.count, max),
              borderColor: `${appearance.color}30`,
            }}
            title={`${agent.agentName}\n${dateLabel(bucket.from)} – ${dateLabel(bucket.to)}\n${bucket.count === null ? "No complete bucket coverage" : `${bucket.count} AGENT invocations · ${bucket.tools ?? 0} tool calls`}\nSelect to zoom`}
            aria-label={`Zoom ${agent.agentName}, ${dateLabel(bucket.from)}, ${bucket.count === null ? "unknown activity" : `${bucket.count} invocations`}`}
            onClick={() => onZoom(bucket.from, bucket.to, agent.agentName)}
          >
            {bucket.count === null ? (
              <span className="text-muted-foreground text-[9px]">?</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
export function AgentActivity({
  agents,
  scope,
  projection,
  view,
  onViewChange,
  onZoom,
}: ActivityProps) {
  const span = scope.to.getTime() - scope.from.getTime();
  const zoom = (factor: number) => {
    const next = Math.min(30 * 86_400_000, Math.max(60_000, span * factor));
    const center = (scope.from.getTime() + scope.to.getTime()) / 2;
    onZoom(new Date(center - next / 2), new Date(center + next / 2));
  };
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Agent activity</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {view === "timeline"
              ? "Agent activity within sessions; dashed bars are traces without a session ID."
              : "Invocation intensity by agent. Select a cell to inspect its window."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={view}
            onValueChange={(value) =>
              onViewChange(value === "heatmap" ? "heatmap" : "timeline")
            }
          >
            <Tabs.List variant="inset" size="sm">
              <Tabs.Trigger value="timeline" label="Session timeline" />
              <Tabs.Trigger value="heatmap" label="Activity heatmap" />
            </Tabs.List>
          </Tabs>
          <Button
            text="Zoom in"
            icon={ZoomIn}
            variant="ghost"
            size="sm"
            onClick={() => zoom(0.5)}
          />
          <Button
            text="Zoom out"
            icon={ZoomOut}
            variant="ghost"
            size="sm"
            onClick={() => zoom(2)}
          />
          <Button
            text="14 days"
            icon={CalendarDays}
            variant="ghost"
            size="sm"
            onClick={() =>
              onZoom(new Date(scope.to.getTime() - 14 * 86_400_000), scope.to)
            }
          />
        </div>
      </div>
      <div className="ph-no-capture overflow-x-auto rounded-lg border">
        <div className="min-w-[42rem]">
          {view === "timeline" ? (
            <>
              <div className="text-muted-foreground bg-muted/30 flex border-b text-[10px]">
                <div className="w-44 shrink-0 px-3 py-2">
                  Agent · observed units
                </div>
                <div className="flex flex-1 justify-between gap-2 px-2 py-2">
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                    <span key={ratio}>
                      {dateLabel(new Date(scope.from.getTime() + span * ratio))}
                    </span>
                  ))}
                </div>
              </div>
              {agents.map((agent) => (
                <TimelineLane
                  key={agent.agentName}
                  agent={agent}
                  scope={scope}
                  projection={projection}
                  onZoom={onZoom}
                />
              ))}
            </>
          ) : (
            <div className="p-3">
              <div className="text-muted-foreground mb-2 ml-43 flex justify-between text-[10px]">
                <span>{dateLabel(scope.from)}</span>
                <span>{dateLabel(scope.to)}</span>
              </div>
              {agents.map((agent) => (
                <HeatmapLane
                  key={agent.agentName}
                  agent={agent}
                  scope={scope}
                  projection={projection}
                  onZoom={onZoom}
                />
              ))}
              <div className="text-muted-foreground mt-3 flex justify-end gap-2 text-[10px]">
                <span>Less</span>
                {["18", "40", "80", "bf", "ff"].map((opacity) => (
                  <span
                    key={opacity}
                    className="size-3 rounded-sm"
                    style={{ background: `#818cf8${opacity}` }}
                  />
                ))}
                <span>More</span>
                <span>· ? = incomplete coverage</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Dormant means no observed activity in this window, within the discovery
        lookback. Bar duration describes observed evidence, not agent execution
        time or the lifetime of a session. Times use your browser’s timezone.
      </p>
    </section>
  );
}

function bucketColor(
  color: string,
  count: number | null,
  max: number,
): string | undefined {
  if (count === null) return undefined;
  if (count === 0) return `${color}0c`;
  return `${color}${Math.round(45 + 210 * Math.sqrt(count / max))
    .toString(16)
    .padStart(2, "0")}`;
}
