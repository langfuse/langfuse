import { OverflowCountBadge } from "@/src/components/OverflowCountBadge";
import { groupScoresByName } from "@/src/components/grouped-score-badge";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import {
  formatMetricCost,
  formatMetricTokens,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
/* eslint-disable no-nested-ternary */
import { type ScoreDomain } from "@langfuse/shared";
import { Plus, Search, X } from "lucide-react";
import { type ReactNode, type SyntheticEvent, useState } from "react";

import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
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
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { numberFormatter } from "@/src/utils/numbers";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

type ModernSessionHeaderProps = {
  projectId: string;
  countTraces: number;
  minTimestamp: Date;
  maxTimestamp: Date;
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
  | "duration"
  | "metadata"
  | "score"
  | "tokens"
  | "traces"
  | "user";

type SessionHeaderDetail = {
  key: string;
  searchText: string;
  type: SessionHeaderDetailType;
  content: ReactNode;
};

const ChipKey = ({ children }: { children: React.ReactNode }) => (
  <span>{children}</span>
);

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
  <span className="inline-flex max-w-[280px] min-w-0">
    <LinkBadge
      href={`/project/${projectId}/users/${encodeURIComponent(user)}`}
      noCapture
      data-session-header-pill="true"
      label="user"
      text={user}
    />
  </span>
);

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
  <span className="group flex max-w-full min-w-0 items-center">
    <BadgeShell font="mono" data-session-header-pill="true">
      <span
        className="text-muted-foreground max-w-64 shrink-0 truncate"
        title={display.path}
      >
        {display.label}
      </span>
      <span className="truncate" title={display.displayValue}>
        {display.displayValue}
      </span>
      <MetadataJsonPathRemoveButton path={display.path} onRemove={onRemove} />
    </BadgeShell>
  </span>
);

const MetadataJsonPathRemoveButton = ({
  path,
  onRemove,
}: {
  path: string;
  onRemove: (path: string) => void;
}) => (
  <span className="-ml-1.5 inline-flex w-0 overflow-hidden transition-[width,margin] group-focus-within:ml-0 group-focus-within:w-4 group-hover:ml-0 group-hover:w-4">
    <button
      type="button"
      aria-label={`Remove metadata JSONPath ${path}`}
      title="Remove metadata JSONPath"
      className="hover:bg-muted focus-visible:ring-ring inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
      onClick={() => onRemove(path)}
    >
      <X className="icon-sm" />
    </button>
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
  minTimestamp,
  maxTimestamp,
  tokensIn,
  tokensOut,
  totalTokens,
  totalCost,
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
  const durationSeconds = Math.max(
    (maxTimestamp.getTime() - minTimestamp.getTime()) / 1000,
    0,
  );
  const pills: SessionHeaderDetail[] = [
    {
      key: "traces",
      searchText: `traces ${countTraces}`,
      type: "traces",
      content: (
        <BadgeShell font="mono" color="ghost" data-session-header-pill="true">
          <span>
            {numberFormatter(countTraces, 0)}{" "}
            <ChipKey>{countTraces === 1 ? "trace" : "traces"}</ChipKey>
          </span>
        </BadgeShell>
      ),
    },
  ];

  pills.push({
    key: "duration",
    searchText: `duration ${durationSeconds}`,
    type: "duration",
    content: (
      <Badge
        font="mono"
        color="ghost"
        data-session-header-pill="true"
        text={formatIntervalSeconds(durationSeconds)}
        title="session duration"
      />
    ),
  });

  if (totalCost > 0) {
    pills.push({
      key: "cost",
      searchText: `cost ${totalCost}`,
      type: "cost",
      content: (
        <Badge
          font="mono"
          color="ghost"
          data-session-header-pill="true"
          text={formatMetricCost(totalCost)}
          title={`exact $${totalCost.toFixed(6)}`}
        />
      ),
    });
  }

  if (totalTokens > 0) {
    pills.push({
      key: "tokens",
      searchText: `tokens ${tokensIn} ${tokensOut} ${totalTokens}`,
      type: "tokens",
      content: (
        <BreakdownTooltip
          details={{ input: tokensIn, output: tokensOut, total: totalTokens }}
          isCost={false}
        >
          <Badge
            font="mono"
            color="ghost"
            interactive
            data-session-header-pill="true"
            text={formatMetricTokens(totalTokens)}
          />
        </BreakdownTooltip>
      ),
    });
  }

  const userDetails = users.map(
    (user): SessionHeaderDetail => ({
      key: `user-${user}`,
      searchText: `user ${user}`,
      type: "user",
      content: <UserChip projectId={projectId} user={user} />,
    }),
  );
  const visibleUserDetails = userDetails.slice(
    0,
    INITIAL_SESSION_USERS_DISPLAY_COUNT,
  );
  visibleUserDetails.forEach((detail) => pills.push(detail));
  const visibleUserDetailKeySet = new Set(
    visibleUserDetails.map((detail) => detail.key),
  );
  const overflowUserDetails = userDetails.filter(
    (detail) => !visibleUserDetailKeySet.has(detail.key),
  );

  Object.entries(groupScoresByName([...scores])).forEach(([name, group]) => {
    pills.push({
      key: `score-${name}`,
      searchText: group
        .map((score) => `score ${score.name} ${scoreChipValue(score)}`)
        .join(" "),
      type: "score",
      content: (
        <span data-session-header-pill="true" className="inline-flex min-w-0">
          <ScoreBadge name={name} scores={group} />
        </span>
      ),
    });
  });

  metadataJsonPaths.paths.forEach((path) => {
    const display = getConfiguredMetadataDisplay(
      path,
      metadataJsonPaths.source,
    );
    pills.push({
      key: `metadata-${path}`,
      searchText: `metadata ${display.path} ${display.label} ${display.displayValue}`,
      type: "metadata",
      content: (
        <MetadataJsonPathPill
          display={display}
          onRemove={removeMetadataJsonPath}
        />
      ),
    });
  });
  return (
    <div className="border-b px-4 pt-1 pb-1.5 font-mono">
      <SingleLineOverflowList
        spacing="comfortable"
        items={pills}
        additionalOverflowCount={overflowUserDetails.length}
        getKey={(pill) => pill.key}
        isTightItem={(pill) => pill.type === "score"}
        renderItem={(pill) => pill.content}
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
                data-session-header-pill="true"
              >
                <Plus className="icon-base" />
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
        renderOverflow={({ hiddenItems: overflowPills, overflowItemCount }) => {
          const normalizedSearch = search.trim().toLocaleLowerCase();
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
                <OverflowCountBadge
                  count={overflowItemCount}
                  data-session-header-pill="true"
                  aria-label={`Show ${overflowItemCount} more session details`}
                />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-0"
                aria-label="All session details"
              >
                <div className="relative border-b p-2">
                  <Search className="text-muted-foreground icon-base absolute top-1/2 left-4 -translate-y-1/2" />
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
                      {filteredPills.map((pill) => (
                        <span
                          key={pill.key}
                          className="flex max-w-full items-center"
                        >
                          {pill.content}
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
