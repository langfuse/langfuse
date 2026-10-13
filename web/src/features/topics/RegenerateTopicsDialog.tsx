import { useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { skipToken } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Shapes } from "lucide-react";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";
import { Input as NumericInput } from "@/src/components/ui/input";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  topicMinimumTraceCountSchema,
  type TopicExecutionStatus,
  type TopicFacet,
  type TopicFacetVersion,
  type TopicRule,
  type TopicTimeRange,
} from "@langfuse/shared/topics";

type TopicExecutionList = RouterOutputs["topics"]["executions"];
type RegenerateFacet = {
  facet: TopicFacet;
  version: TopicFacetVersion;
  summaries: number;
};

const label = "Regenerate topics";
const runStatus: Record<
  TopicExecutionStatus,
  { text: string; color: "blue" | "green" | "yellow" | "red" }
> = {
  queued: { text: "Queued", color: "blue" },
  running: { text: "Running", color: "blue" },
  completed: { text: "Completed", color: "green" },
  completed_with_errors: { text: "Finished with errors", color: "yellow" },
  failed: { text: "Failed", color: "red" },
};
const isBusy = (status: TopicExecutionStatus) =>
  status === "queued" || status === "running";

/**
 * Header entry point and dialog for rebuilding topics from stored summaries
 * (`topics.trigger` with `operation: "update"`). Facets follow the Topics rule
 * at their latest version, the one automatic processing summarizes with.
 */
export function useRegenerateTopics({
  projectId,
  facets,
  canWrite,
  timeRange,
  executions,
  onTriggered,
}: {
  projectId: string;
  facets: TopicFacet[];
  canWrite: boolean;
  timeRange: TopicTimeRange | null;
  executions: TopicExecutionList | undefined;
  onTriggered: (executionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const settings = api.topics.modelSettings.useQuery({ projectId });
  const rules = api.topics.rules.useQuery({ projectId });
  const configured = Boolean(
    settings.data?.summary &&
    settings.data.embedding &&
    settings.data.clustering,
  );
  const rule = rules.data?.length === 1 ? rules.data[0] : null;
  const candidates = ruleFacets(facets, rule);
  const summaryCounts = api.topics.summaryCounts.useQuery(
    timeRange && configured && candidates.length > 0
      ? {
          projectId,
          facets: candidates.map(({ facet, version }) => ({
            facetId: facet.id,
            version: version.version,
          })),
          timeRange,
        }
      : skipToken,
  );
  const regenerateFacets: RegenerateFacet[] = candidates.map((candidate) => ({
    ...candidate,
    summaries:
      summaryCounts.data?.find(
        (count) =>
          count.facetId === candidate.facet.id &&
          count.facetVersion === candidate.version.version,
      )?.count ?? 0,
  }));
  const disabledReason = regenerateDisabledReason({
    canWrite,
    settings: settings.isPending
      ? "loading"
      : {
          configured,
          pausedMessage: settings.data?.blockedAt
            ? (settings.data.blockMessage ?? "")
            : null,
        },
    runInProgress: Boolean(
      executions?.some((execution) => isBusy(execution.status)),
    ),
    hasTimeRange: timeRange !== null,
    facetCount: candidates.length,
    summaries: {
      isPending: summaryCounts.isPending,
      error: summaryCounts.error?.message ?? null,
      total: regenerateFacets.reduce((sum, facet) => sum + facet.summaries, 0),
    },
  });
  const lastRun =
    executions?.find((execution) => execution.input.operation === "update") ??
    null;
  const openDialog = () => setOpen(true);

  const action = (
    <DisabledReasonTooltip reason={disabledReason}>
      <Button
        text={label}
        size="sm"
        variant="secondary"
        disabled={disabledReason !== null}
        onClick={openDialog}
      />
    </DisabledReasonTooltip>
  );
  const menuRow = (closeMenu: () => void) => (
    <HeaderActionMenuRow
      label={label}
      icon={<Shapes className="icon-base text-icon-foreground" />}
      disabled={disabledReason !== null}
      disabledReason={disabledReason ?? undefined}
      onClick={() => {
        closeMenu();
        openDialog();
      }}
    />
  );
  const dialog = (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {open && timeRange && (
        <RegenerateTopicsDialog
          projectId={projectId}
          facets={regenerateFacets}
          timeRange={timeRange}
          lastRun={lastRun}
          disabledReason={disabledReason}
          onOpenRun={(executionId) => {
            setOpen(false);
            onTriggered(executionId);
          }}
        />
      )}
    </DialogPrimitive.Root>
  );
  return { action, menuRow, dialog };
}

function ruleFacets(facets: TopicFacet[], rule: TopicRule | null) {
  return facets.flatMap((facet) => {
    const version = facet.versions[0];
    if (!version || (rule && !rule.facetIds.includes(facet.id))) return [];
    return [{ facet, version }];
  });
}

function regenerateDisabledReason({
  canWrite,
  settings,
  runInProgress,
  hasTimeRange,
  facetCount,
  summaries,
}: {
  canWrite: boolean;
  settings: "loading" | { configured: boolean; pausedMessage: string | null };
  runInProgress: boolean;
  hasTimeRange: boolean;
  facetCount: number;
  summaries: { isPending: boolean; error: string | null; total: number };
}): string | null {
  if (!canWrite)
    return "You need permission to manage Topics in this project to regenerate topics.";
  if (settings === "loading") return "Checking the Topics setup…";
  if (settings.pausedMessage !== null)
    return ["Topics is paused.", settings.pausedMessage]
      .filter(Boolean)
      .join(" ");
  if (!settings.configured)
    return "Choose the Topics models in Configure Topics first.";
  if (runInProgress)
    return "A Topics run is in progress. Regenerate when it finishes.";
  if (!hasTimeRange) return "Select a time range of at most 90 days.";
  if (facetCount === 0)
    return "Turn on at least one facet in Configure Topics.";
  if (summaries.isPending) return "Counting stored summaries…";
  if (summaries.error !== null)
    return `Could not count stored summaries: ${summaries.error}`;
  if (summaries.total === 0)
    return "No trace summaries in the selected time range yet. Summarize traces first, then regenerate.";
  return null;
}

function DisabledReasonTooltip({
  reason,
  children,
}: {
  reason: string | null;
  children: React.ReactNode;
}) {
  if (reason === null) return children;
  return (
    <Tooltip label={reason} placement="bottom">
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} tabIndex={0} aria-label={reason}>
          {children}
        </span>
      )}
    </Tooltip>
  );
}

function RegenerateTopicsDialog({
  projectId,
  facets,
  timeRange,
  lastRun,
  disabledReason,
  onOpenRun,
}: {
  projectId: string;
  facets: RegenerateFacet[];
  timeRange: TopicTimeRange;
  lastRun: TopicExecutionList[number] | null;
  disabledReason: string | null;
  onOpenRun: (executionId: string) => void;
}) {
  const [selectedFacetIds, setSelectedFacetIds] = useState(
    () =>
      new Set(
        facets
          .filter((facet) => facet.summaries > 0)
          .map((facet) => facet.facet.id),
      ),
  );
  const [exploratory, setExploratory] = useState(false);
  const [minimumTraceCount, setMinimumTraceCount] = useState<string | null>(
    null,
  );
  const minimumValue = minimumTraceCount ?? (exploratory ? "10" : "100");
  const minimum = topicMinimumTraceCountSchema.safeParse(Number(minimumValue));
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const trigger = api.topics.trigger.useMutation();
  const selected = facets.filter(
    (facet) => facet.summaries > 0 && selectedFacetIds.has(facet.facet.id),
  );
  const belowMinimum = minimum.success
    ? selected.filter((facet) => facet.summaries < minimum.data)
    : [];

  async function submit() {
    if (!minimum.success || selected.length === 0) return;
    setError(null);
    const values = {
      projectId,
      operation: "update" as const,
      facets: selected.map(({ facet, version }) => ({
        facetId: facet.id,
        version: version.version,
      })),
      exploratory,
      timeRange,
      minimumTraceCount: minimum.data,
    };
    const key = JSON.stringify(values);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      const result = await trigger.mutateAsync({
        ...values,
        requestId: request.current.id,
      });
      request.current = null;
      onOpenRun(result.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not regenerate topics.",
      );
    }
  }

  return (
    <Dialog
      title={label}
      size="lg"
      actions={[
        {
          label,
          loading: trigger.isPending,
          disabled:
            disabledReason !== null ||
            trigger.isPending ||
            !minimum.success ||
            selected.length === 0,
          onClick: submit,
        },
      ]}
    >
      <Dialog.Body>
        <div className="ph-no-capture flex flex-col gap-5 text-sm">
          <div className="flex flex-col gap-2">
            <p>
              Rebuilds topics for each selected facet from the trace summaries
              already stored in this time range. Summaries are grouped, each
              group is named, and traces are reassigned to the new topics.
            </p>
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5">
              <li>
                No traces are summarized again. Stored summaries and embeddings
                are reused.
              </li>
              <li>
                Your clustering model names each topic, billed to its LLM
                connection.
              </li>
              <li>
                The new topics replace the ones shown on this page. Topic names
                and groups can change. If the run fails, the current topics
                stay.
              </li>
            </ul>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Time range</dt>
            <dd>
              {format(timeRange.from, "MMM d, yyyy HH:mm")} –{" "}
              {format(timeRange.to, "MMM d, yyyy HH:mm")}
              <span className="text-muted-foreground">
                {" "}
                · from the page time picker
              </span>
            </dd>
            <dt className="text-muted-foreground">Last run</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {lastRun ? (
                <>
                  <Badge
                    text={runStatus[lastRun.status].text}
                    color={runStatus[lastRun.status].color}
                  />
                  <span>
                    {formatDistanceToNow(new Date(lastRun.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <Button
                    text="View run"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenRun(lastRun.id)}
                  />
                </>
              ) : (
                <span className="text-muted-foreground">
                  Topics have not been regenerated yet.
                </span>
              )}
            </dd>
          </dl>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-bold">Facets</legend>
            {facets.map(({ facet, summaries }) => (
              <label
                key={facet.id}
                className="bg-muted/30 flex items-center justify-between gap-3 rounded-md p-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    aria-label={facet.name}
                    disabled={summaries === 0}
                    checked={summaries > 0 && selectedFacetIds.has(facet.id)}
                    onCheckedChange={(checked) =>
                      setSelectedFacetIds((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(facet.id);
                        else next.delete(facet.id);
                        return next;
                      })
                    }
                  />
                  {facet.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {summaries > 0
                    ? `${summaries.toLocaleString()} summaries`
                    : "No summaries in this range"}
                </span>
              </label>
            ))}
          </fieldset>
          {belowMinimum.length > 0 && (
            <Alert variant="warning" size="sm">
              <Alert.Description>
                <p>
                  {belowMinimum.map(({ facet }) => facet.name).join(", ")}{" "}
                  {belowMinimum.length === 1 ? "has" : "have"} fewer than{" "}
                  {minimum.success ? minimum.data.toLocaleString() : ""}{" "}
                  summaries and will be marked &ldquo;More traces needed&rdquo;.
                  Summarize more traces, widen the time range, or use small
                  sample mode under Advanced.
                </p>
              </Alert.Description>
            </Alert>
          )}
          <Accordion type="single" collapsible>
            <Accordion.Item value="advanced">
              <Accordion.Trigger size="sm">Advanced</Accordion.Trigger>
              <Accordion.Content>
                <div className="flex flex-col gap-3 pb-3">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={exploratory}
                      onCheckedChange={(value) =>
                        setExploratory(value === true)
                      }
                    />
                    Small sample mode (smaller, provisional topics)
                  </label>
                  <label className="flex flex-col gap-1">
                    Minimum summaries per facet
                    <NumericInput
                      aria-label="Minimum summaries per facet"
                      aria-invalid={!minimum.success}
                      className="w-28"
                      type="number"
                      min={3}
                      step={1}
                      value={minimumValue}
                      onChange={(event) =>
                        setMinimumTraceCount(event.target.value)
                      }
                    />
                  </label>
                  <p className="text-muted-foreground text-xs">
                    {minimum.success
                      ? `Facets with fewer than ${minimum.data.toLocaleString()} summaries are skipped.`
                      : "Enter a whole number of at least 3."}{" "}
                    Small sample mode lowers the default minimum to 10 and the
                    minimum topic size from 15 to 3 traces.
                  </p>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
          {disabledReason && (
            <Alert variant="warning" size="sm">
              <Alert.Description>
                <p className="break-words">{disabledReason}</p>
              </Alert.Description>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" size="sm">
              <Alert.Description>
                <p className="break-words">{error}</p>
              </Alert.Description>
            </Alert>
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
