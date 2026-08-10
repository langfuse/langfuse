import { percentile, type ScoreDomain } from "@langfuse/shared";
import { ArrowUpRight, Search } from "lucide-react";
import { type ReactNode, useState } from "react";

import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { ModernSessionHeaderPill } from "@/src/components/session/ModernSessionHeaderPill";
import {
  INITIAL_SESSION_USERS_DISPLAY_COUNT,
  SESSION_USERS_PER_PAGE,
} from "@/src/components/session/sessionUsers";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";

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
  scores: ReadonlyArray<
    Pick<
      WithStringifiedMetadata<ScoreDomain>,
      "id" | "name" | "dataType" | "value" | "stringValue"
    >
  >;
};

const ChipValue = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground">{children}</span>
);

const ChipDot = () => <span className="text-foreground-tertiary">·</span>;

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
  <ModernSessionHeaderPill
    variant="link"
    href={`/project/${projectId}/users/${encodeURIComponent(user)}`}
    title={user}
  >
    user{" "}
    <span
      className="text-foreground group-hover:text-link truncate"
      title={user}
    >
      {user}
    </span>
    <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
  </ModernSessionHeaderPill>
);

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
  scores,
}: ModernSessionHeaderProps) {
  const [search, setSearch] = useState("");
  const [visibleUserCount, setVisibleUserCount] = useState(
    SESSION_USERS_PER_PAGE,
  );
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
  const p95LatencyMs =
    latencies.length > 0 ? percentile(latencies, 0.95) : null;
  const pills: Array<{ key: string; searchText: string; content: ReactNode }> =
    [
      {
        key: "traces",
        searchText: `traces ${countTraces} spans ${spanCount ?? ""}`,
        content: (
          <ModernSessionHeaderPill variant="display">
            <span>
              <ChipValue>{numberFormatter(countTraces, 0)}</ChipValue> traces
            </span>
            {spanCount !== null ? (
              <>
                <ChipDot />
                <span>
                  <ChipValue>{numberFormatter(spanCount, 0)}</ChipValue> spans
                </span>
              </>
            ) : null}
          </ModernSessionHeaderPill>
        ),
      },
    ];

  if (p50LatencyMs !== null) {
    pills.push({
      key: "latency",
      searchText: `latency p50 ${p50LatencyMs} p95 ${p95LatencyMs ?? ""}`,
      content: (
        <ModernSessionHeaderPill variant="display">
          <span>
            p50{" "}
            <ChipValue>{formatIntervalSeconds(p50LatencyMs / 1000)}</ChipValue>
          </span>
          {p95LatencyMs !== null ? (
            <>
              <ChipDot />
              <span>
                p95{" "}
                <ChipValue>
                  {formatIntervalSeconds(p95LatencyMs / 1000)}
                </ChipValue>
              </span>
            </>
          ) : null}
        </ModernSessionHeaderPill>
      ),
    });
  }

  if (totalTokens > 0) {
    pills.push({
      key: "tokens",
      searchText: `tokens ${tokensIn} ${tokensOut} ${totalTokens}`,
      content: (
        <ModernSessionHeaderPill variant="display">
          <span>
            tokens{" "}
            <ChipValue>
              {numberFormatter(tokensIn, 0)} → {numberFormatter(tokensOut, 0)}{" "}
              (Σ {numberFormatter(totalTokens, 0)})
            </ChipValue>
          </span>
        </ModernSessionHeaderPill>
      ),
    });
  }

  pills.push({
    key: "cost",
    searchText: `cost ${totalCost}`,
    content: (
      <ModernSessionHeaderPill
        variant="display"
        title={`exact $${totalCost.toFixed(6)}`}
      >
        <span>
          cost <ChipValue>{usdFormatter(totalCost, 2, 3)}</ChipValue>
        </span>
      </ModernSessionHeaderPill>
    ),
  });

  scores.forEach((score) => {
    const value = scoreChipValue(score);
    const isFraction =
      score.dataType === "NUMERIC" &&
      score.value !== null &&
      score.value !== undefined &&
      score.value >= 0 &&
      score.value <= 1;
    pills.push({
      key: `score-${score.id}`,
      searchText: `score ${score.name} ${value}`,
      content: (
        <ModernSessionHeaderPill variant="display" title={score.name}>
          {isFraction ? (
            <span className="bg-dark-yellow h-1.5 w-1.5 shrink-0 rounded-[1px]" />
          ) : null}
          <span className="max-w-40 truncate" title={score.name}>
            {score.name}
          </span>
          <ChipValue>{value}</ChipValue>
        </ModernSessionHeaderPill>
      ),
    });
  });

  if (environment) {
    pills.push({
      key: "environment",
      searchText: `environment env ${environment}`,
      content: (
        <ModernSessionHeaderPill variant="display">
          <span>
            env <ChipValue>{environment}</ChipValue>
          </span>
        </ModernSessionHeaderPill>
      ),
    });
  }

  users.slice(0, INITIAL_SESSION_USERS_DISPLAY_COUNT).forEach((user) => {
    pills.push({
      key: `user-${user}`,
      searchText: `user ${user}`,
      content: <UserChip projectId={projectId} user={user} />,
    });
  });
  const remainingUsers = users.slice(INITIAL_SESSION_USERS_DISPLAY_COUNT);

  return (
    <div className="bg-header border-b px-4 py-2">
      <SingleLineOverflowList
        items={pills}
        additionalOverflowCount={remainingUsers.length}
        getKey={(pill) => pill.key}
        renderItem={(pill) => pill.content}
        renderOverflow={({ hiddenItems: hiddenPills, overflowItemCount }) => {
          const normalizedSearch = search.trim().toLocaleLowerCase();
          const filteredPills = normalizedSearch
            ? hiddenPills.filter((pill) =>
                pill.searchText.toLocaleLowerCase().includes(normalizedSearch),
              )
            : hiddenPills;
          const filteredUsers = normalizedSearch
            ? remainingUsers.filter((user) =>
                user.toLocaleLowerCase().includes(normalizedSearch),
              )
            : remainingUsers;
          const visibleUsers = filteredUsers.slice(0, visibleUserCount);
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
                <ModernSessionHeaderPill
                  variant="button"
                  ariaLabel={`Show ${overflowItemCount} hidden session details`}
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
                        filteredUsers.length,
                      ),
                    );
                  }}
                >
                  {hasResults ? (
                    <>
                      {filteredPills.map((pill) => (
                        <div key={pill.key}>{pill.content}</div>
                      ))}
                      {visibleUsers.map((user) => (
                        <UserChip
                          key={user}
                          projectId={projectId}
                          user={user}
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
