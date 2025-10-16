import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { type LastUserScore, type APIScoreV2 } from "@langfuse/shared";
import {
  BracesIcon,
  MessageCircleMoreIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import Link from "next/link";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

const partitionScores = <T extends APIScoreV2 | LastUserScore>(
  scores: Record<string, T[]>,
  maxVisible?: number,
) => {
  const sortedScores = Object.entries(scores).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  if (!maxVisible) return { visibleScores: sortedScores, hiddenScores: [] };

  const visibleScores = sortedScores.slice(0, maxVisible);
  const hiddenScores = sortedScores.slice(maxVisible);
  return { visibleScores, hiddenScores };
};

const hasMetadata = (score: APIScoreV2 | LastUserScore) => {
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

const ScoreGroupBadge = <T extends APIScoreV2 | LastUserScore>({
  name,
  scores,
  compact,
  badgeClassName,
}: {
  name: string;
  scores: T[];
  compact?: boolean;
  badgeClassName?: string;
}) => {
  const projectId = useProjectIdFromURL();

  return (
    <Badge
      variant="tertiary"
      key={name}
      className={`flex items-center gap-1 ${compact ? "px-1.5 leading-tight" : "px-2.5"} text-xs font-normal${badgeClassName ? " " + badgeClassName : ""}`}
    >
      <div
        className={`w-fit max-w-20 truncate ${compact ? "leading-tight" : ""}`}
        title={name}
      >
        {name}:
      </div>
      <div className="flex items-center gap-1 text-nowrap">
        {scores.map((s, i) => (
          <span
            key={i}
            className="group/score ml-1 flex items-center gap-1 rounded-sm first:ml-0"
          >
            {s.stringValue ?? s.value?.toFixed(2) ?? ""}
            {s.comment && (
              <HoverCard>
                <HoverCardTrigger className="inline-block">
                  <MessageCircleMoreIcon className="mb-[0.0625rem] !size-3" />
                </HoverCardTrigger>
                <HoverCardContent className="max-h-[50dvh] overflow-y-auto whitespace-normal break-normal text-xs">
                  <p className="whitespace-pre-wrap">{s.comment}</p>
                  {"executionTraceId" in s &&
                    s.executionTraceId &&
                    projectId && (
                      <Link
                        href={`/project/${projectId}/traces/${encodeURIComponent(s.executionTraceId)}`}
                        className="mt-2 flex items-center gap-1 text-blue-600 hover:underline"
                        target="_blank"
                      >
                        <ExternalLinkIcon className="h-3 w-3" />
                        View execution trace
                      </Link>
                    )}
                </HoverCardContent>
              </HoverCard>
            )}
            {hasMetadata(s) && (
              <HoverCard>
                <HoverCardTrigger className="inline-block">
                  <BracesIcon className="mb-[0.0625rem] !size-3" />
                </HoverCardTrigger>
                <HoverCardContent className="max-h-[50dvh] overflow-y-auto whitespace-normal break-normal rounded-md border-none p-0 text-xs">
                  <JSONView codeClassName="!rounded-md" json={s.metadata} />
                </HoverCardContent>
              </HoverCard>
            )}
            <span className="group-last/score:hidden">,</span>
          </span>
        ))}
      </div>
    </Badge>
  );
};

export const GroupedScoreBadges = <T extends APIScoreV2 | LastUserScore>({
  scores,
  maxVisible,
  compact,
  badgeClassName,
}: {
  scores: T[];
  maxVisible?: number;
  compact?: boolean;
  badgeClassName?: string;
}) => {
  const groupedScores = scores.reduce<Record<string, T[]>>((acc, score) => {
    if (!acc[score.name] || !Array.isArray(acc[score.name])) {
      acc[score.name] = [score];
    } else {
      acc[score.name].push(score);
    }
    return acc;
  }, {});

  const { visibleScores, hiddenScores } = partitionScores(
    groupedScores,
    maxVisible,
  );

  return (
    <>
      {visibleScores.map(([name, scores]) => (
        <ScoreGroupBadge
          key={name}
          name={name}
          scores={scores}
          compact={compact}
          badgeClassName={badgeClassName}
        />
      ))}
      {Boolean(hiddenScores.length) && (
        <HoverCard>
          <HoverCardTrigger className="inline-block rounded-sm">
            <Badge
              className={`cursor-pointer ${compact ? "px-0.5 py-0 leading-tight" : "px-1"} text-xs font-medium${badgeClassName ? " " + badgeClassName : ""}`}
              variant="tertiary"
            >
              +{hiddenScores.length}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="max-h-[300px] max-w-[200px] overflow-y-auto p-2">
            <div className="flex flex-wrap gap-1">
              {hiddenScores.map(([name, scores]) => (
                <ScoreGroupBadge
                  key={name}
                  name={name}
                  scores={scores}
                  compact={compact}
                  badgeClassName={badgeClassName}
                />
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </>
  );
};
