import { type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import {
  executionLabels,
  formatTopicCost,
  formatTopicRunCost,
  topicRunCostLabel,
  type TopicRunCost,
} from "./topic-run-labels";
import {
  topicRuleFreshness,
  topicWindowLabel,
  type TopicAnalysisMap,
  type TopicRuleMap,
} from "./topic-maps";

function Strip({
  status,
  mobileStatus = true,
  run,
  controls,
  options,
}: {
  status?: string;
  mobileStatus?: boolean;
  run?: { cost: string; label: string; onView: () => void };
  controls?: ReactNode;
  options?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ph-no-capture shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm md:flex",
        run ? "flex" : "hidden",
      )}
    >
      {controls && (
        <span className="hidden items-center gap-3 md:flex">{controls}</span>
      )}
      <span
        className={cn(
          "flex flex-wrap items-center gap-y-1 md:ml-auto",
          run ? "gap-x-3" : "gap-x-6",
        )}
      >
        {status && (
          <span
            className={cn(
              "text-muted-foreground whitespace-nowrap",
              !mobileStatus && "hidden md:inline",
            )}
          >
            {status}
          </span>
        )}
        {run && (
          <>
            <span className="text-muted-foreground">{run.cost}</span>
            <Button
              text={run.label}
              size="sm"
              variant="text"
              onClick={run.onView}
            />
          </>
        )}
        {options && <span className="hidden md:flex">{options}</span>}
      </span>
    </div>
  );
}

type RefreshHistory = RouterOutputs["topics"]["ruleRefreshHistory"];

function refreshCost(refresh: RefreshHistory[number] | null | undefined) {
  if (refresh == null) return formatTopicCost(refresh);
  return refresh.status === "running" && refresh.cost === null
    ? "Pending"
    : formatTopicCost(refresh.cost, refresh.partial);
}

/** The selected live map's controls and when its map was last fitted or refreshed. */
function TopicRuleStrip({
  rule,
  refreshes,
  now,
  mapShown = false,
  controls,
  options,
}: {
  rule: TopicRuleMap;
  /** Undefined while loading, null when history could not be read. */
  refreshes: RefreshHistory | null | undefined;
  now: number;
  /** A topic map is on screen (e.g. setup's), so "pending" would contradict it. */
  mapShown?: boolean;
  /** Question tabs and view switch. */
  controls?: ReactNode;
  /** View options, e.g. the Unassigned switch. */
  options?: ReactNode;
}) {
  const latest = refreshes?.[0];
  const current = refreshes?.find((refresh) => refresh.status === "running");
  const running = Boolean(current) || rule.refresh.running;
  const costLabel = running ? "Refresh cost so far" : "Last refresh cost";
  const entry = refreshes && (current ?? latest ?? null);
  const cost = running && !current ? "Pending" : refreshCost(entry);
  return (
    <DialogController
      renderDialog={() => (
        <Dialog
          noCapture
          title={`Refresh history · ${rule.name}`}
          closeLabel="Close"
        >
          <Dialog.Body>
            <p className="text-muted-foreground text-sm">
              Estimated model cost covers topic naming. Refreshes reuse existing
              summaries and embeddings.
            </p>
            {refreshes && refreshes.length > 0 && (
              <ul className="divide-y">
                {refreshes.map((refresh) => (
                  <li
                    key={refresh.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {refresh.trigger === "manual"
                          ? "Manual refresh"
                          : "Nightly refresh"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <time dateTime={refresh.startedAt}>
                          {new Date(refresh.startedAt).toLocaleString(
                            undefined,
                            { dateStyle: "medium", timeStyle: "short" },
                          )}
                        </time>
                        {" · "}
                        {refresh.status === "skipped"
                          ? "Skipped"
                          : executionLabels[refresh.status]}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm">
                      {refreshCost(refresh)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {refreshes === undefined && <p>Loading refresh history…</p>}
            {refreshes === null && <p>Could not load refresh history.</p>}
            {refreshes?.length === 0 && <p>No tracked refreshes yet.</p>}
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => (
        <Strip
          status={topicRuleStatus(rule, now, mapShown)}
          mobileStatus={false}
          run={
            latest || rule.lastRefitAt || running
              ? {
                  cost: `${costLabel} · ${cost}`,
                  label: "Refresh history",
                  onView: openDialog,
                }
              : undefined
          }
          controls={controls}
          options={options}
        />
      )}
    </DialogController>
  );
}

/** A live map's status line, e.g. "Updated 2h ago"; empty when there is nothing to say. */
export function topicRuleStatus(
  rule: TopicRuleMap,
  now: number,
  mapShown: boolean,
) {
  if (rule.refresh.running) return "Refreshing map…";
  if (rule.enabled === false || rule.lastRefitAt || !mapShown)
    return topicRuleFreshness(rule, now);
  return "";
}

/** A past run's controls and the period it covered. */
function TopicAnalysisStrip({
  analysis,
  costBreakdown,
  onViewRun,
  controls,
  options,
}: {
  analysis: TopicAnalysisMap;
  costBreakdown: TopicRunCost | null | undefined;
  onViewRun: () => void;
  controls?: ReactNode;
  options?: ReactNode;
}) {
  const cost = formatTopicRunCost(
    { operation: "update", analysis },
    costBreakdown,
    analysis.status,
  );
  return (
    <Strip
      status={topicAnalysisStatus(analysis)}
      run={{
        cost: `${topicRunCostLabel(analysis.status)} · ${cost}`,
        label: "View run",
        onView: onViewRun,
      }}
      controls={controls}
      options={options}
    />
  );
}

/** A past run's status line: its trace count and period. */
function topicAnalysisStatus(analysis: TopicAnalysisMap) {
  return `${analysis.traceCount.toLocaleString("en-US")} traces · ${topicWindowLabel(analysis.timeRange)}`;
}

/** The row under the Topics header for a live map or a past run. */
export const TopicMapStrip = {
  Rule: TopicRuleStrip,
  Analysis: TopicAnalysisStrip,
};
