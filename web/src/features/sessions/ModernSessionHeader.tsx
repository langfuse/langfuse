import { percentile, type ScoreDomain } from "@langfuse/shared";
import { Clock, Plus, Search, X } from "lucide-react";
import { type ReactNode, type SyntheticEvent, useState } from "react";

import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ModernSessionHeaderPill } from "@/src/features/sessions/ModernSessionHeaderPill";
import { sessionHeaderDynamicDetailKey } from "@/src/features/sessions/sessionHeaderVisibility";
import {
  getMetadataJsonPathLabel,
  resolveMetadataJsonPath,
  type FirstVisibleObservationMetadataState,
  type SessionMetadataJsonPathState,
} from "@/src/features/sessions/sessionMetadataJsonPath";
import {
  INITIAL_SESSION_USERS_DISPLAY_COUNT,
  SESSION_USERS_PER_PAGE,
} from "@/src/features/sessions/sessionUsers";
import { UserIdBadge } from "@/src/features/traces/components/TraceMetadataBadges";
import {
  EnvironmentBadge,
  KeyValueText,
  METRIC_TEXT_CLASS,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostUsageBadge } from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { numberFormatter } from "@/src/utils/numbers";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * Session detail header, in the trace view's visual grammar
 * (`TraceSummaryStrip` / `TraceDetailViewHeader`): metrics are quiet muted
 * text, references are links, attributes are key:value text, and only scores
 * are boxed (as score chips, two inline then "+N", matching the trace
 * header). The pill
 * primitive survives for the "+N" overflow control alone.
 *
 * The latency metric is the median trace latency alone. Behaviour is
 * unchanged: one measured line with a searchable "+N" overflow popover (users
 * paginate inside it), pinned metadata JSONPaths with a hover remove and a `+`
 * editor, and the PostHog captures on JSONPath config changes.
 */

type ModernSessionHeaderProps = {
  projectId: string;
  countTraces: number;
  traces:
    | { state: "loading" }
    | {
        state: "loaded";
        data: ReadonlyArray<{
          latencyMs: number | null;
          observationCount: number;
        }>;
      };
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  totalCost: number;
  environment: string | null;
  users: readonly string[];
  metadataJsonPaths: SessionMetadataJsonPathState;
  /** Full score rows: the chips render the comment / metadata hover cards
      off the same fields the trace tree chips use. */
  scores: ReadonlyArray<WithStringifiedMetadata<ScoreDomain>>;
};

// Score names shown before "+N", same cap as the trace header and tree rows.
const MAX_INLINE_SCORE_GROUPS = 2;

type SessionHeaderDetailType =
  | "cost"
  | "environment"
  | "latency"
  | "metadata"
  | "score"
  | "traces"
  | "user";

type SessionHeaderDetail = {
  key: string;
  searchText: string;
  type: SessionHeaderDetailType;
  content: ReactNode;
};

/** Numbers carry the emphasis inside a metric; the words stay muted. */
const MetricValue = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground">{children}</span>
);

const MetricDot = () => <span className="text-foreground-tertiary">·</span>;

const scoreSearchValue = (
  score: Pick<WithStringifiedMetadata<ScoreDomain>, "stringValue" | "value">,
) => {
  if (score.stringValue) return score.stringValue;
  if (score.value === null || score.value === undefined) return "";
  return Number.isInteger(score.value)
    ? String(score.value)
    : score.value.toFixed(2);
};

const resolveAgainstSource = (
  source: FirstVisibleObservationMetadataState,
  path: string,
) => {
  if (source.state === "ready") {
    return resolveMetadataJsonPath(source.metadata, path);
  }

  const syntax = resolveMetadataJsonPath({}, path);
  if (syntax.state === "invalid") return syntax;
  return source;
};

const getConfiguredMetadataDisplay = (
  path: string,
  source: FirstVisibleObservationMetadataState,
) => {
  const resolution = resolveAgainstSource(source, path);
  return {
    path,
    label: getMetadataJsonPathLabel(path),
    displayValue:
      resolution.state === "match"
        ? resolution.displayValue
        : resolution.state === "loading" || resolution.state === "idle"
          ? "…"
          : "—",
  };
};

/**
 * A pinned metadata JSONPath reads as the same key:value attribute text as
 * `env` — the only extra is the remove affordance, which stays hidden until
 * the row is hovered or focused so the line still scans as text.
 */
const MetadataJsonPathText = ({
  display,
  onRemove,
}: {
  display: ReturnType<typeof getConfiguredMetadataDisplay>;
  onRemove: (path: string) => void;
}) => (
  <span className="group flex items-center" title={display.path}>
    <KeyValueText label={display.label} value={display.displayValue} />
    <span className="inline-flex w-0 overflow-hidden transition-[width,margin] group-focus-within:ml-1 group-focus-within:w-4 group-hover:ml-1 group-hover:w-4">
      <button
        type="button"
        aria-label={`Remove metadata JSONPath ${display.path}`}
        title="Remove metadata JSONPath"
        className="hover:bg-muted focus-visible:ring-ring inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
        onClick={() => onRemove(display.path)}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  </span>
);

const MetadataJsonPathEditorContent = ({
  metadataJsonPaths,
  onClose,
  onSave,
}: {
  metadataJsonPaths: SessionMetadataJsonPathState;
  onClose: () => void;
  onSave: (path: string) => void;
}) => {
  const [draftPath, setDraftPath] = useState("");
  const normalizedDraftPath = draftPath.trim();
  const draftResolution = resolveAgainstSource(
    metadataJsonPaths.source,
    draftPath,
  );
  const draftIsDuplicate =
    metadataJsonPaths.paths.includes(normalizedDraftPath);
  const draftIsValid =
    normalizedDraftPath.length > 0 &&
    draftResolution.state !== "invalid" &&
    !draftIsDuplicate;

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftIsValid) return;
    onSave(normalizedDraftPath);
    onClose();
  };

  return (
    <PopoverContent
      align="end"
      className="w-96"
      aria-label="Add metadata JSONPath"
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-metadata-jsonpath">Metadata JSONPath</Label>
          <Input
            id="session-metadata-jsonpath"
            value={draftPath}
            onChange={(event) => setDraftPath(event.target.value)}
            placeholder="$.langfuse_user_email"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="bg-muted/40 flex min-h-14 flex-col gap-1 rounded-md border p-2 text-xs">
          <span className="text-muted-foreground font-bold">Preview</span>
          {normalizedDraftPath.length === 0 ? (
            <span className="text-muted-foreground">
              Enter a JSONPath to preview metadata.
            </span>
          ) : draftIsDuplicate ? (
            <span className="text-muted-foreground">
              This JSONPath is already shown.
            </span>
          ) : draftResolution.state === "match" ? (
            <span className="font-mono break-all">
              {draftResolution.displayValue}
            </span>
          ) : draftResolution.state === "invalid" ? (
            <span className="text-destructive">{draftResolution.message}</span>
          ) : draftResolution.state === "loading" ||
            draftResolution.state === "idle" ? (
            <span className="text-muted-foreground">
              Loading first visible observation…
            </span>
          ) : draftResolution.state === "error" ? (
            <span className="text-destructive">
              Could not load the first visible observation.
            </span>
          ) : draftResolution.state === "empty" ? (
            <span className="text-muted-foreground">
              No observation matches the current view.
            </span>
          ) : (
            <span className="text-muted-foreground">
              No match on the first visible observation.
            </span>
          )}
          {metadataJsonPaths.source.state === "ready" &&
          metadataJsonPaths.source.metadataTruncated ? (
            <span className="text-amber-600 dark:text-amber-500">
              Metadata is truncated in this session preview.
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!draftIsValid}>
            Save
          </Button>
        </div>
      </form>
    </PopoverContent>
  );
};

export function ModernSessionHeader({
  projectId,
  countTraces,
  traces,
  tokensIn,
  tokensOut,
  totalTokens,
  totalCost,
  environment,
  users,
  metadataJsonPaths,
  scores,
}: ModernSessionHeaderProps) {
  const capture = usePostHogClientCapture();
  const [search, setSearch] = useState("");
  const [visibleUserCount, setVisibleUserCount] = useState(
    SESSION_USERS_PER_PAGE,
  );
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const handleMetadataEditorOpenChange = (open: boolean) => {
    setIsMetadataEditorOpen(open);
    metadataJsonPaths.onEditorOpenChange(open);
  };
  const saveMetadataJsonPath = (path: string) => {
    metadataJsonPaths.onSave(path);
    capture("session_detail:metadata_jsonpath_config_changed", {
      action: "add",
      configuredPathCount: metadataJsonPaths.paths.length + 1,
      isV4: true,
    });
  };
  const removeMetadataJsonPath = (path: string) => {
    metadataJsonPaths.onRemove(path);
    capture("session_detail:metadata_jsonpath_config_changed", {
      action: "remove",
      configuredPathCount: Math.max(metadataJsonPaths.paths.length - 1, 0),
      isV4: true,
    });
  };
  const latencies =
    traces.state === "loaded"
      ? traces.data.flatMap((trace) =>
          trace.latencyMs !== null && trace.latencyMs > 0
            ? [trace.latencyMs]
            : [],
        )
      : [];
  const spanCount =
    traces.state === "loaded"
      ? traces.data.reduce((total, trace) => total + trace.observationCount, 0)
      : null;
  const p50LatencyMs = latencies.length > 0 ? percentile(latencies, 0.5) : null;
  const details: SessionHeaderDetail[] = [
    {
      key: "traces",
      searchText: `traces ${countTraces} spans ${spanCount ?? ""}`,
      type: "traces",
      content: (
        <span className={METRIC_TEXT_CLASS}>
          <span>
            <MetricValue>{numberFormatter(countTraces, 0)}</MetricValue> traces
          </span>
          {spanCount !== null ? (
            <>
              <MetricDot />
              <span>
                <MetricValue>{numberFormatter(spanCount, 0)}</MetricValue> spans
              </span>
            </>
          ) : null}
        </span>
      ),
    },
  ];

  if (p50LatencyMs !== null) {
    details.push({
      key: "latency",
      searchText: `latency p50 ${p50LatencyMs}`,
      type: "latency",
      content: (
        <span title="Median trace latency" className={METRIC_TEXT_CLASS}>
          <Clock className="size-3 shrink-0" aria-hidden />
          <span>
            p50{" "}
            <MetricValue>
              {formatIntervalSeconds(p50LatencyMs / 1000)}
            </MetricValue>
          </span>
        </span>
      ),
    });
  }

  // One element for cost AND usage, exactly as the trace summary strip does
  // it: cost as plain text, then a coin icon + the token total whose hover
  // carries the input/output breakdown. Sessions have no per-direction cost
  // or per-key usage map, so the detail maps go in empty.
  details.push({
    key: "cost",
    searchText: `cost ${totalCost} tokens ${tokensIn} ${tokensOut} ${totalTokens}`,
    type: "cost",
    content: (
      <CostUsageBadge
        totalCost={totalCost}
        costDetails={{}}
        inputUsage={tokensIn}
        outputUsage={tokensOut}
        totalUsage={totalTokens}
        usageDetails={{}}
      />
    ),
  });

  // Same grammar as the trace header: two score names inline, then "+N"
  // whose hover lists them all. One detail item, so the overflow search
  // still finds every score name.
  if (scores.length > 0) {
    details.push({
      key: "scores",
      searchText: `scores ${scores
        .map((score) => `${score.name} ${scoreSearchValue(score)}`)
        .join(" ")}`,
      type: "score",
      content: (
        <span className="inline-flex items-center gap-1">
          <GroupedScoreBadges
            compact
            scores={[...scores]}
            maxVisible={MAX_INLINE_SCORE_GROUPS}
          />
        </span>
      ),
    });
  }

  if (environment) {
    details.push({
      key: "environment",
      searchText: `environment env ${environment}`,
      type: "environment",
      content: <EnvironmentBadge environment={environment} />,
    });
  }

  const userDetails = users.map(
    (user): SessionHeaderDetail => ({
      key: sessionHeaderDynamicDetailKey("user", user),
      searchText: `user ${user}`,
      type: "user",
      // UserIdBadge already carries `ph-no-capture`, so user ids stay masked
      // in PostHog session recordings.
      content: <UserIdBadge userId={user} projectId={projectId} />,
    }),
  );
  const visibleUserDetails = userDetails.slice(
    0,
    INITIAL_SESSION_USERS_DISPLAY_COUNT,
  );
  visibleUserDetails.forEach((detail) => details.push(detail));
  const visibleUserDetailKeySet = new Set(
    visibleUserDetails.map((detail) => detail.key),
  );
  const overflowUserDetails = userDetails.filter(
    (detail) => !visibleUserDetailKeySet.has(detail.key),
  );

  metadataJsonPaths.paths.forEach((path) => {
    const display = getConfiguredMetadataDisplay(
      path,
      metadataJsonPaths.source,
    );
    details.push({
      key: sessionHeaderDynamicDetailKey("metadata", path),
      searchText: `metadata ${display.path} ${display.label} ${display.displayValue}`,
      type: "metadata",
      content: (
        <MetadataJsonPathText
          display={display}
          onRemove={removeMetadataJsonPath}
        />
      ),
    });
  });
  return (
    <div className="bg-header border-b px-4 py-2">
      <SingleLineOverflowList
        items={details}
        additionalOverflowCount={overflowUserDetails.length}
        spacing="comfortable"
        getKey={(detail) => detail.key}
        renderItem={(detail) => detail.content}
        trailingContent={
          <Popover
            open={isMetadataEditorOpen}
            onOpenChange={handleMetadataEditorOpenChange}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Add metadata JSONPath"
                title="Add metadata JSONPath"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            {isMetadataEditorOpen ? (
              <MetadataJsonPathEditorContent
                metadataJsonPaths={metadataJsonPaths}
                onClose={() => handleMetadataEditorOpenChange(false)}
                onSave={saveMetadataJsonPath}
              />
            ) : null}
          </Popover>
        }
        renderOverflow={({
          hiddenItems: overflowDetails,
          overflowItemCount,
        }) => {
          const normalizedSearch = search.trim().toLocaleLowerCase();
          const filteredDetails = normalizedSearch
            ? overflowDetails.filter((detail) =>
                detail.searchText
                  .toLocaleLowerCase()
                  .includes(normalizedSearch),
              )
            : overflowDetails;
          const filteredUserDetails = normalizedSearch
            ? overflowUserDetails.filter((detail) =>
                detail.searchText
                  .toLocaleLowerCase()
                  .includes(normalizedSearch),
              )
            : overflowUserDetails;
          const visibleUsers = filteredUserDetails.slice(0, visibleUserCount);
          const hasResults =
            filteredDetails.length > 0 || visibleUsers.length > 0;

          return (
            <Popover
              onOpenChange={(open) => {
                if (open) return;
                setSearch("");
                setVisibleUserCount(SESSION_USERS_PER_PAGE);
              }}
            >
              <PopoverTrigger asChild>
                <ModernSessionHeaderPill
                  variant="button"
                  ariaLabel={`Show ${overflowItemCount} more session details`}
                >
                  +{overflowItemCount}
                </ModernSessionHeaderPill>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-0"
                aria-label="All session details"
              >
                <div className="relative border-b p-2">
                  <Search className="text-muted-foreground absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setVisibleUserCount(SESSION_USERS_PER_PAGE);
                    }}
                    placeholder="Search session details"
                    aria-label="Search session details"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div
                  role="region"
                  aria-label="Session detail results"
                  className="flex max-h-72 flex-col items-start gap-2 overflow-y-auto p-2"
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    const isAtBottom =
                      element.scrollHeight -
                        element.scrollTop -
                        element.clientHeight <=
                      16;
                    if (!isAtBottom) return;
                    setVisibleUserCount((current) =>
                      Math.min(
                        current + SESSION_USERS_PER_PAGE,
                        filteredUserDetails.length,
                      ),
                    );
                  }}
                >
                  {hasResults ? (
                    <>
                      {filteredDetails.map((detail) => (
                        <span key={detail.key} className="flex items-center">
                          {detail.content}
                        </span>
                      ))}
                      {visibleUsers.map((detail) => (
                        <span key={detail.key} className="flex items-center">
                          {detail.content}
                        </span>
                      ))}
                    </>
                  ) : (
                    <p className="text-muted-foreground px-2 py-4 text-xs">
                      No session details found.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        }}
      />
    </div>
  );
}
