/* eslint-disable no-nested-ternary */
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { percentile, type ScoreDomain } from "@langfuse/shared";
import { ArrowUpRight, Eye, EyeOff, Plus, Search, X } from "lucide-react";
import { type ReactNode, type SyntheticEvent, useRef, useState } from "react";

import Link from "next/link";

import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import {
  MAX_STORED_HIDDEN_SESSION_HEADER_DETAILS,
  parseStoredHiddenSessionHeaderDetails,
  sessionHeaderDynamicDetailKey,
  sessionHeaderVisibilityStorageKey,
} from "@/src/features/sessions/sessionHeaderVisibility";
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
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import useLocalStorage from "@/src/components/useLocalStorage";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  compactNumberFormatter,
  numberFormatter,
  usdFormatter,
} from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

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
  users: readonly string[];
  metadataJsonPaths: SessionMetadataJsonPathState;
  scores: ReadonlyArray<WithStringifiedMetadata<ScoreDomain>>;
};

type SessionHeaderDetailType =
  | "cost"
  | "latency"
  | "metadata"
  | "score"
  | "tokens"
  | "traces"
  | "user";

type SessionHeaderDetail = {
  key: string;
  searchText: string;
  visibilityLabel: string;
  type: SessionHeaderDetailType;
  content: ReactNode;
};

type SessionHeaderDetailControlLocation = "header" | "overflow";

const EMPTY_HIDDEN_SESSION_HEADER_DETAILS: readonly string[] = [];

const ChipKey = ({ children }: { children: React.ReactNode }) => (
  <span>{children}</span>
);

const compactTokenFormatter = (tokens: number) =>
  compactNumberFormatter(tokens, 0).toLowerCase();

const scoreChipValue = (
  score: Pick<WithStringifiedMetadata<ScoreDomain>, "stringValue" | "value">,
) => {
  if (score.stringValue) return score.stringValue;
  if (score.value === null || score.value === undefined) return "—";
  return Number.isInteger(score.value)
    ? String(score.value)
    : score.value.toFixed(2);
};

const UserChip = ({ projectId, user }: { projectId: string; user: string }) => (
  <Link
    href={`/project/${projectId}/users/${encodeURIComponent(user)}`}
    className="ph-no-capture inline-flex max-w-[280px] min-w-0"
  >
    <Badge
      color="ghost"
      interactive="link"
      data-session-header-pill="true"
      label="user"
      text={user}
      trailingIcon={ArrowUpRight}
      trailingIconTone="link"
    />
  </Link>
);

const SessionHeaderDetailWithVisibilityControl = ({
  detail,
  isHidden,
  location,
  onVisibilityChange,
}: {
  detail: SessionHeaderDetail;
  isHidden: boolean;
  location: SessionHeaderDetailControlLocation;
  onVisibilityChange: (
    detail: SessionHeaderDetail,
    isHidden: boolean,
    location: SessionHeaderDetailControlLocation,
    control: HTMLButtonElement,
  ) => void;
}) => {
  const action = isHidden ? "Show" : "Hide";
  return (
    <span
      className={cn(
        "group relative flex items-center",
        detail.type === "metadata" ? "pr-6" : "[@media(hover:none)]:pr-6",
      )}
    >
      {detail.content}
      <button
        type="button"
        aria-label={`${action} ${detail.visibilityLabel} in session header`}
        title={`${action} in session header`}
        className="bg-header hover:bg-muted focus-visible:ring-ring absolute right-0 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none [@media(hover:none)]:opacity-100"
        onClick={(event) =>
          onVisibilityChange(detail, !isHidden, location, event.currentTarget)
        }
      >
        {isHidden ? (
          <Eye aria-hidden="true" className="h-3 w-3" />
        ) : (
          <EyeOff aria-hidden="true" className="h-3 w-3" />
        )}
      </button>
    </span>
  );
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

const MetadataJsonPathPill = ({
  display,
  onRemove,
}: {
  display: ReturnType<typeof getConfiguredMetadataDisplay>;
  onRemove: (path: string) => void;
}) => (
  <span className="group flex items-center">
    <BadgeShell data-session-header-pill="true">
      <span
        className="text-muted-foreground max-w-40 truncate"
        title={display.path}
      >
        {display.label}
      </span>
      <span className="max-w-56 truncate" title={display.displayValue}>
        {display.displayValue}
      </span>
      <span className="-ml-1.5 inline-flex w-0 overflow-hidden transition-[width,margin] group-focus-within:ml-0 group-focus-within:w-4 group-hover:ml-0 group-hover:w-4">
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
    </BadgeShell>
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
  users,
  metadataJsonPaths,
  scores,
}: ModernSessionHeaderProps) {
  const capture = usePostHogClientCapture();
  const [rawHiddenDetailKeys, setRawHiddenDetailKeys] =
    useLocalStorage<unknown>(
      sessionHeaderVisibilityStorageKey(projectId),
      EMPTY_HIDDEN_SESSION_HEADER_DETAILS,
    );
  const hiddenDetailKeys =
    parseStoredHiddenSessionHeaderDetails(rawHiddenDetailKeys);
  const hiddenDetailKeySet = new Set(hiddenDetailKeys);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const metadataEditorButtonRef = useRef<HTMLButtonElement>(null);
  const overflowSearchInputRef = useRef<HTMLInputElement>(null);
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
  const p50LatencyMs = latencies.length > 0 ? percentile(latencies, 0.5) : null;
  const pills: SessionHeaderDetail[] = [
    {
      key: "traces",
      searchText: `traces ${countTraces}`,
      visibilityLabel: "trace count",
      type: "traces",
      content: (
        <BadgeShell color="ghost" data-session-header-pill="true">
          <span>
            {numberFormatter(countTraces, 0)} <ChipKey>traces</ChipKey>
          </span>
        </BadgeShell>
      ),
    },
  ];

  if (p50LatencyMs !== null) {
    pills.push({
      key: "latency",
      searchText: `latency p50 ${p50LatencyMs}`,
      visibilityLabel: "latency",
      type: "latency",
      content: (
        <Badge
          color="ghost"
          data-session-header-pill="true"
          text={formatIntervalSeconds(p50LatencyMs / 1000)}
          title="p50 latency"
        />
      ),
    });
  }

  if (totalTokens > 0) {
    pills.push({
      key: "tokens",
      searchText: `tokens ${tokensIn} ${tokensOut} ${totalTokens}`,
      visibilityLabel: "token usage",
      type: "tokens",
      content: (
        <BreakdownTooltip
          details={{ input: tokensIn, output: tokensOut, total: totalTokens }}
          isCost={false}
        >
          <Badge
            color="ghost"
            interactive
            data-session-header-pill="true"
            text={`${compactTokenFormatter(totalTokens)} tokens`}
          />
        </BreakdownTooltip>
      ),
    });
  }

  pills.push({
    key: "cost",
    searchText: `cost ${totalCost}`,
    visibilityLabel: "cost",
    type: "cost",
    content: (
      <Badge
        color="ghost"
        data-session-header-pill="true"
        text={usdFormatter(totalCost, 2, 3)}
        title={`exact $${totalCost.toFixed(6)}`}
      />
    ),
  });

  scores.forEach((score, index) => {
    pills.push({
      key: sessionHeaderDynamicDetailKey("score", score.id),
      searchText: `score ${score.name} ${scoreChipValue(score)}`,
      visibilityLabel: `score ${index + 1}`,
      type: "score",
      content: (
        <span data-session-header-pill="true" className="inline-flex min-w-0">
          <ScoreBadge name={score.name} scores={[score]} />
        </span>
      ),
    });
  });

  const userDetails = users.map(
    (user, index): SessionHeaderDetail => ({
      key: sessionHeaderDynamicDetailKey("user", user),
      searchText: `user ${user}`,
      visibilityLabel: `user ${index + 1}`,
      type: "user",
      content: <UserChip projectId={projectId} user={user} />,
    }),
  );
  const visibleUserDetails = userDetails
    .filter((detail) => !hiddenDetailKeySet.has(detail.key))
    .slice(0, INITIAL_SESSION_USERS_DISPLAY_COUNT);
  visibleUserDetails.forEach((detail) => pills.push(detail));
  const visibleUserDetailKeySet = new Set(
    visibleUserDetails.map((detail) => detail.key),
  );
  const overflowUserDetails = userDetails.filter(
    (detail) => !visibleUserDetailKeySet.has(detail.key),
  );

  metadataJsonPaths.paths.forEach((path, index) => {
    const display = getConfiguredMetadataDisplay(
      path,
      metadataJsonPaths.source,
    );
    pills.push({
      key: sessionHeaderDynamicDetailKey("metadata", path),
      searchText: `metadata ${display.path} ${display.label} ${display.displayValue}`,
      visibilityLabel: `metadata ${index + 1}`,
      type: "metadata",
      content: (
        <MetadataJsonPathPill
          display={display}
          onRemove={removeMetadataJsonPath}
        />
      ),
    });
  });
  const visiblePills = pills.filter(
    (pill) => !hiddenDetailKeySet.has(pill.key),
  );
  const manuallyHiddenPills = pills.filter((pill) =>
    hiddenDetailKeySet.has(pill.key),
  );
  const changeDetailVisibility = (
    detail: SessionHeaderDetail,
    isHidden: boolean,
    location: SessionHeaderDetailControlLocation,
    control: HTMLButtonElement,
  ) => {
    if (hiddenDetailKeySet.has(detail.key) === isHidden) return;

    setRawHiddenDetailKeys((current: unknown) => {
      const currentKeys = parseStoredHiddenSessionHeaderDetails(current);
      return isHidden
        ? currentKeys
            .concat(detail.key)
            .slice(-MAX_STORED_HIDDEN_SESSION_HEADER_DETAILS)
        : currentKeys.filter((key) => key !== detail.key);
    });
    capture("session_detail:header_detail_visibility_changed", {
      action: isHidden ? "hide" : "show",
      detailType: detail.type,
      storedHiddenDetailCount: Math.min(
        Math.max(hiddenDetailKeys.length + (isHidden ? 1 : -1), 0),
        MAX_STORED_HIDDEN_SESSION_HEADER_DETAILS,
      ),
      isV4: true,
    });
    window.requestAnimationFrame(() => {
      if (control.isConnected) return;

      const preferredTarget =
        location === "overflow"
          ? overflowSearchInputRef.current
          : overflowButtonRef.current;
      (
        preferredTarget ??
        overflowButtonRef.current ??
        metadataEditorButtonRef.current
      )?.focus();
    });
  };

  return (
    <div className="border-b px-4 py-2">
      <SingleLineOverflowList
        spacing="comfortable"
        items={visiblePills}
        additionalOverflowCount={
          overflowUserDetails.length + manuallyHiddenPills.length
        }
        getKey={(pill) => pill.key}
        isTightItem={(pill) => pill.type === "score"}
        renderItem={(pill) => (
          <SessionHeaderDetailWithVisibilityControl
            detail={pill}
            isHidden={false}
            location="header"
            onVisibilityChange={changeDetailVisibility}
          />
        )}
        trailingContent={
          <Popover
            open={isMetadataEditorOpen}
            onOpenChange={handleMetadataEditorOpenChange}
          >
            <PopoverTrigger asChild>
              <BadgeShell asChild data-session-header-pill="true">
                <button
                  type="button"
                  aria-label="Add metadata JSONPath"
                  ref={metadataEditorButtonRef}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </BadgeShell>
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
        renderOverflow={({ hiddenItems: hiddenPills, overflowItemCount }) => {
          const normalizedSearch = search.trim().toLocaleLowerCase();
          const overflowPillKeys = new Set(
            hiddenPills
              .map((pill) => pill.key)
              .concat(manuallyHiddenPills.map((pill) => pill.key)),
          );
          const overflowPills = pills.filter((pill) =>
            overflowPillKeys.has(pill.key),
          );
          const filteredPills = normalizedSearch
            ? overflowPills.filter((pill) =>
                pill.searchText.toLocaleLowerCase().includes(normalizedSearch),
              )
            : overflowPills;
          const filteredUserDetails = normalizedSearch
            ? overflowUserDetails.filter((detail) =>
                detail.searchText
                  .toLocaleLowerCase()
                  .includes(normalizedSearch),
              )
            : overflowUserDetails;
          const visibleUsers = filteredUserDetails.slice(0, visibleUserCount);
          const hasResults =
            filteredPills.length > 0 || visibleUsers.length > 0;

          return (
            <Popover
              onOpenChange={(open) => {
                if (open) return;
                setSearch("");
                setVisibleUserCount(SESSION_USERS_PER_PAGE);
              }}
            >
              <PopoverTrigger asChild>
                <BadgeShell asChild data-session-header-pill="true">
                  <button
                    type="button"
                    aria-label={`Show ${overflowItemCount} hidden session details`}
                    ref={overflowButtonRef}
                  >
                    +{overflowItemCount}
                  </button>
                </BadgeShell>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-0"
                aria-label="All session details"
              >
                <div className="relative border-b p-2">
                  <Search className="text-muted-foreground absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    ref={overflowSearchInputRef}
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
                      {filteredPills.map((pill) => (
                        <SessionHeaderDetailWithVisibilityControl
                          key={pill.key}
                          detail={pill}
                          isHidden={hiddenDetailKeySet.has(pill.key)}
                          location="overflow"
                          onVisibilityChange={changeDetailVisibility}
                        />
                      ))}
                      {visibleUsers.map((detail) => (
                        <SessionHeaderDetailWithVisibilityControl
                          key={detail.key}
                          detail={detail}
                          isHidden={hiddenDetailKeySet.has(detail.key)}
                          location="overflow"
                          onVisibilityChange={changeDetailVisibility}
                        />
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
