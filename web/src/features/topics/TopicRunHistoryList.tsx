import { type ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { CircleAlert, History } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type RouterOutputs } from "@/src/utils/api";
import { costFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import {
  busy,
  executionDotClasses,
  executionLabels,
  operationLabels,
} from "./topic-run-labels";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

type Run = RouterOutputs["topics"]["executions"][number];

type TopicRunHistoryListProps = {
  executions: Run[];
  errorMessage?: string;
  onOpen: (executionId: string) => void;
  onRetry: () => void;
};

function formatCount(count: number) {
  return count.toLocaleString("en-US");
}

function plural(count: number) {
  return count === 1 ? "trace" : "traces";
}

function traceCount(run: Run) {
  return Math.max(0, ...run.facets.map((facet) => facet.counts.requested));
}

function dayLabel(date: Date, now: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(
    date,
    date.getFullYear() === now.getFullYear() ? "MMM d" : "MMM d, yyyy",
  );
}

function groupByDay(runs: Run[]) {
  const now = new Date();
  const groups: { label: string; runs: Run[] }[] = [];
  for (const run of runs) {
    const label = dayLabel(new Date(run.createdAt), now);
    const last = groups.at(-1);
    if (last?.label === label) last.runs.push(run);
    else groups.push({ label, runs: [run] });
  }
  return groups;
}

function problemReason(run: Run) {
  const failed = Math.max(0, ...run.facets.map((f) => f.counts.failed));
  if (failed > 0) return `${formatCount(failed)} ${plural(failed)} failed`;
  const skipped = Math.max(
    0,
    ...run.facets.map((f) => f.counts.insufficientInput),
  );
  if (skipped > 0)
    return `${formatCount(skipped)} ${plural(skipped)} skipped: not enough input`;
  return run.error ?? run.facets.find((f) => f.error)?.error ?? null;
}

function runDetail(run: Run): { text: string; problem: boolean } | null {
  if (run.status === "failed" || run.status === "completed_with_errors") {
    const reason = problemReason(run);
    if (reason) return { text: reason, problem: true };
  }
  if (run.input.operation !== "process") return null;
  const parts = [`${formatCount(traceCount(run))} traces`];
  if (run.estimatedCost != null)
    parts.push(
      `${busy(run.status) ? "~" : ""}${costFormatter(run.estimatedCost)}`,
    );
  return { text: parts.join(" · "), problem: false };
}

function CenteredState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 pb-44">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        {icon}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-muted-foreground text-sm text-balance break-words">
            {body}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Run["status"] }) {
  const label = executionLabels[status];
  return (
    <Tooltip label={label} hoverableContent={false}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          role="img"
          aria-label={label}
          className="inline-flex shrink-0 p-1.5"
        >
          <span
            className={cn("size-2 rounded-full", executionDotClasses[status])}
          />
        </span>
      )}
    </Tooltip>
  );
}

function ActiveRun({
  run,
  onOpen,
}: {
  run: Run;
  onOpen: (id: string) => void;
}) {
  const total = traceCount(run);
  const processed = Math.min(
    total,
    ...run.facets.map((facet) => facet.counts.complete),
  );
  const showProgress = run.input.operation === "process" && total > 0;
  return (
    <div
      role="status"
      className="bg-muted/40 flex flex-col gap-2 border-b px-4 py-3.5"
    >
      <button
        type="button"
        onClick={() => onOpen(run.id)}
        className="flex items-center justify-between gap-3 text-left hover:underline"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
          <StatusDot status={run.status} />
          <span
            className="truncate"
            title={operationLabels[run.input.operation]}
          >
            {operationLabels[run.input.operation]}
          </span>
        </span>
        <span className="text-muted-foreground font-mono text-xs">
          {format(new Date(run.createdAt), "HH:mm")}
        </span>
      </button>
      {showProgress && (
        <div className="bg-muted h-1.5 overflow-hidden rounded-sm">
          <div
            className="bg-foreground h-full rounded-sm"
            style={{ width: `${(processed / total) * 100}%` }}
          />
        </div>
      )}
      {showProgress && (
        <div className="flex justify-end text-xs">
          <span className="font-mono">
            {formatCount(processed)} / {formatCount(total)}
          </span>
        </div>
      )}
    </div>
  );
}

function RunRow({ run, onOpen }: { run: Run; onOpen: (id: string) => void }) {
  const name = operationLabels[run.input.operation];
  const detail = runDetail(run);
  return (
    <button
      type="button"
      onClick={() => onOpen(run.id)}
      className="hover:bg-muted flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left"
    >
      <span className="text-muted-foreground w-11 shrink-0 pt-0.5 font-mono text-xs">
        {format(new Date(run.createdAt), "HH:mm")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm" title={name}>
          {name}
        </span>
        {detail && (
          <span
            className={cn(
              "text-xs",
              detail.problem
                ? "text-foreground-secondary"
                : "text-muted-foreground",
            )}
          >
            {detail.text}
          </span>
        )}
      </span>
      <StatusDot status={run.status} />
    </button>
  );
}

function Empty() {
  return (
    <CenteredState
      icon={<History size="lg" color="muted" />}
      title="No runs yet"
      body="Runs show up here as Topics processes your traces."
    />
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <CenteredState
      icon={<CircleAlert size="lg" color="destructive" />}
      title="Couldn’t load run history"
      body={message}
    >
      <Button
        text="Try again"
        variant="secondary"
        size="sm"
        onClick={onRetry}
      />
    </CenteredState>
  );
}

export function TopicRunHistoryList({
  executions,
  errorMessage,
  onOpen,
  onRetry,
}: TopicRunHistoryListProps) {
  if (errorMessage && executions.length === 0) {
    return <LoadError message={errorMessage} onRetry={onRetry} />;
  }
  if (executions.length === 0) return <Empty />;
  const runs = [...executions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const active = runs.find((run) => run.status === "running") ?? null;
  const past = runs.filter((run) => run !== active);
  return (
    <div className="flex flex-col">
      {errorMessage && (
        <div className="px-4 pt-4">
          <TopicsErrorMessage message={errorMessage} />
        </div>
      )}
      {active && <ActiveRun run={active} onOpen={onOpen} />}
      {groupByDay(past).map((group) => (
        <section key={group.runs[0].id} className="px-2 pt-2.5 pb-1">
          <h3 className="text-muted-foreground px-2 text-xs font-bold">
            {group.label}
          </h3>
          {group.runs.map((run) => (
            <RunRow key={run.id} run={run} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  );
}
