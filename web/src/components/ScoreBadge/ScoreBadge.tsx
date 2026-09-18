import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import {
  BracesIcon,
  ExternalLinkIcon,
  MessageCircleMoreIcon,
} from "lucide-react";
import Link from "next/link";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  SCORE_LEVEL_DESCRIPTIONS,
  SCORE_LEVEL_DOT_CLASSES,
  scoreLevelFromScore,
} from "@/src/components/score-tag";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { cn } from "@/src/utils/tailwind";

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
}: {
  name: string;
  scores: T[];
}) => {
  const projectId = useProjectIdFromURL();

  const levels = Array.from(
    new Set(scores.map((score) => scoreLevelFromScore(score))),
  );

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      <BadgeShell>
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <CustomTooltip
            content={
              <span className="flex flex-col gap-1">
                {levels.map((level) => (
                  <span key={level} className="flex items-start gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        SCORE_LEVEL_DOT_CLASSES[level],
                      )}
                    />
                    <span>{SCORE_LEVEL_DESCRIPTIONS[level]}</span>
                  </span>
                ))}
              </span>
            }
          >
            {({ getTriggerProps }) => (
              <span
                {...getTriggerProps()}
                role="img"
                aria-label={levels
                  .map((level) => SCORE_LEVEL_DESCRIPTIONS[level])
                  .join("; ")}
                className="flex shrink-0 items-center gap-0.5"
              >
                {levels.map((level) => (
                  <span
                    key={level}
                    className={cn(
                      "size-1.5 rounded-full",
                      SCORE_LEVEL_DOT_CLASSES[level],
                    )}
                  />
                ))}
              </span>
            )}
          </CustomTooltip>
          <span className="min-w-0 truncate" title={name}>
            {name}:
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1 text-nowrap">
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
                {score.comment && (
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
    </span>
  );
};
