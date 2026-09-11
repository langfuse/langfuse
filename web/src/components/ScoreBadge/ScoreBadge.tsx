import { cn } from "@/src/utils/tailwind";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import {
  BracesIcon,
  ExternalLinkIcon,
  MessageCircleMoreIcon,
} from "lucide-react";
import Link from "next/link";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { ScoreTag, scoreLevelFromScore } from "@/src/components/score-tag";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

const hasMetadata = (
  score: WithStringifiedMetadata<ScoreDomain> | LastUserScore,
) => {
  if (!score.metadata) return false;
  try {
    const metadata =
      typeof score.metadata === "string"
        ? JSON.parse(score.metadata)
        : score.metadata;
    return Object.keys(metadata).length > 0;
  } catch {
    return false;
  }
};

const ExecutionTraceLink = ({
  executionTraceId,
  projectId,
}: {
  executionTraceId: string;
  projectId: string;
}) => {
  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(executionTraceId)}`}
      className="flex items-center gap-1 text-blue-600 hover:underline"
      target="_blank"
    >
      <ExternalLinkIcon className="h-3 w-3" />
      View execution trace
    </Link>
  );
};

export const ScoreBadge = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
  name,
  scores,
  compact,
  showLevels,
}: {
  name: string;
  scores: T[];
  compact?: boolean;
  /** Render this group's level tags when the selection mixes score levels. */
  showLevels?: boolean;
}) => {
  const projectId = useProjectIdFromURL();

  const levels = showLevels
    ? Array.from(new Set(scores.map((score) => scoreLevelFromScore(score))))
    : [];
  const commented = scores.filter((score) => Boolean(score.comment));

  return (
    <span className="inline-flex max-w-full min-w-0 cursor-default items-center gap-1">
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      {compact && commented.length > 0 ? (
        // Dense rows have no room for the comment icon: the whole chip is the
        // trigger and the card lists every commented score in the group.
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <BadgeShell color="neutral" size={compact ? "sm" : "default"}>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  compact && "text-muted-foreground",
                )}
                title={name}
              >
                {name}:
              </span>
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1 text-nowrap",
                  compact && "text-muted-foreground",
                )}
              >
                {scores.map((score, index) => {
                  const value =
                    score.stringValue ?? score.value?.toFixed(2) ?? "";

                  return (
                    <span
                      key={index}
                      className="inline-flex min-w-0 items-center gap-1"
                    >
                      <span className="truncate" title={value}>
                        {value}
                      </span>
                      {score.comment && !compact && (
                        <HoverCard>
                          <HoverCardTrigger
                            aria-label={`View comment for ${name}: ${value}`}
                            className="inline-block shrink-0"
                          >
                            <MessageCircleMoreIcon className="mb-0.25 size-3!" />
                          </HoverCardTrigger>
                          <HoverCardContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
                            <p className="whitespace-pre-wrap">
                              {score.comment}
                            </p>
                            {"executionTraceId" in score &&
                              score.executionTraceId &&
                              projectId && (
                                <div className="mt-2">
                                  <ExecutionTraceLink
                                    executionTraceId={score.executionTraceId}
                                    projectId={projectId}
                                  />
                                </div>
                              )}
                          </HoverCardContent>
                        </HoverCard>
                      )}
                      {/* Compact chips already sit inside the comment hover
                          trigger; a nested trigger would open two cards. */}
                      {hasMetadata(score) && !compact && (
                        <HoverCard>
                          <HoverCardTrigger
                            aria-label={`View metadata for ${name}: ${value}`}
                            className="inline-block shrink-0"
                          >
                            <BracesIcon className="mb-0.25 size-3!" />
                          </HoverCardTrigger>
                          <HoverCardContent className="max-h-[50dvh] overflow-y-auto rounded-md border-none p-0 text-xs break-normal whitespace-normal">
                            <JSONView
                              codeClassName="rounded-md!"
                              json={score.metadata}
                            />
                          </HoverCardContent>
                        </HoverCard>
                      )}
                      {index < scores.length - 1 && <span>,</span>}
                    </span>
                  );
                })}
              </span>
            </BadgeShell>
          </HoverCardTrigger>
          <HoverCardContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
            {commented.map((score, index) => (
              <div key={index} className={index > 0 ? "mt-2" : undefined}>
                <p className="whitespace-pre-wrap">
                  {commented.length > 1 ? (
                    <span className="text-muted-foreground">
                      {score.stringValue ?? score.value?.toFixed(2) ?? ""}:{" "}
                    </span>
                  ) : null}
                  {score.comment}
                </p>
                {"executionTraceId" in score &&
                  score.executionTraceId &&
                  projectId && (
                    <div className="mt-2">
                      <ExecutionTraceLink
                        executionTraceId={score.executionTraceId}
                        projectId={projectId}
                      />
                    </div>
                  )}
              </div>
            ))}
          </HoverCardContent>
        </HoverCard>
      ) : (
        <BadgeShell color="neutral" size={compact ? "sm" : "default"}>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              compact && "text-muted-foreground",
            )}
            title={name}
          >
            {name}:
          </span>
          <span
            className={cn(
              "flex min-w-0 items-center gap-1 text-nowrap",
              compact && "text-muted-foreground",
            )}
          >
            {scores.map((score, index) => {
              const value = score.stringValue ?? score.value?.toFixed(2) ?? "";

              return (
                <span
                  key={index}
                  className="inline-flex min-w-0 items-center gap-1"
                >
                  <span className="truncate" title={value}>
                    {value}
                  </span>
                  {score.comment && !compact && (
                    <HoverCard>
                      <HoverCardTrigger
                        aria-label={`View comment for ${name}: ${value}`}
                        className="inline-block shrink-0"
                      >
                        <MessageCircleMoreIcon className="mb-0.25 size-3!" />
                      </HoverCardTrigger>
                      <HoverCardContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
                        <p className="whitespace-pre-wrap">{score.comment}</p>
                        {"executionTraceId" in score &&
                          score.executionTraceId &&
                          projectId && (
                            <div className="mt-2">
                              <ExecutionTraceLink
                                executionTraceId={score.executionTraceId}
                                projectId={projectId}
                              />
                            </div>
                          )}
                      </HoverCardContent>
                    </HoverCard>
                  )}
                  {hasMetadata(score) && (
                    <HoverCard>
                      <HoverCardTrigger
                        aria-label={`View metadata for ${name}: ${value}`}
                        className="inline-block shrink-0"
                      >
                        <BracesIcon className="mb-0.25 size-3!" />
                      </HoverCardTrigger>
                      <HoverCardContent className="max-h-[50dvh] overflow-y-auto rounded-md border-none p-0 text-xs break-normal whitespace-normal">
                        <JSONView
                          codeClassName="rounded-md!"
                          json={score.metadata}
                        />
                      </HoverCardContent>
                    </HoverCard>
                  )}
                  {index < scores.length - 1 && <span>,</span>}
                </span>
              );
            })}
          </span>
        </BadgeShell>
      )}
    </span>
  );
};
