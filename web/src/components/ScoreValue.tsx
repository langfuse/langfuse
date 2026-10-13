import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import {
  BracesIcon,
  ExternalLinkIcon,
  MessageCircleMoreIcon,
} from "lucide-react";
import Link from "next/link";

import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

type ChipScore = WithStringifiedMetadata<ScoreDomain> | LastUserScore;

const hasMetadata = (score: ChipScore) => {
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

export const ScoreValue = ({
  name,
  score,
}: {
  name: string;
  score: ChipScore;
}) => {
  const projectId = useProjectIdFromURL();
  const value = score.stringValue ?? score.value?.toFixed(2) ?? "";

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="text-foreground truncate py-0.5" title={value}>
        {value}
      </span>
      {score.comment && (
        <HoverCard
          content={
            <div className="max-h-[50dvh] w-64 overflow-y-auto p-3 text-xs break-normal whitespace-normal">
              <p className="whitespace-pre-wrap">{score.comment}</p>
              {"executionTraceId" in score &&
                score.executionTraceId &&
                projectId && (
                  <div className="mt-2">
                    <Link
                      href={`/project/${projectId}/traces/${encodeURIComponent(score.executionTraceId)}`}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                      target="_blank"
                    >
                      <ExternalLinkIcon className="icon-sm" />
                      View execution trace
                    </Link>
                  </div>
                )}
            </div>
          }
        >
          {({ getTriggerProps }) => (
            <button
              type="button"
              aria-label={`View comment for ${name}: ${value}`}
              className="inline-block shrink-0"
              {...getTriggerProps()}
            >
              <MessageCircleMoreIcon className="text-foreground-tertiary icon-sm! mb-0.25" />
            </button>
          )}
        </HoverCard>
      )}
      {hasMetadata(score) && (
        <HoverCard
          content={
            <div className="max-h-[50dvh] w-64 overflow-y-auto rounded-md p-0 text-xs break-normal whitespace-normal">
              <JSONView codeClassName="rounded-md!" json={score.metadata} />
            </div>
          }
        >
          {({ getTriggerProps }) => (
            <button
              type="button"
              aria-label={`View metadata for ${name}: ${value}`}
              className="inline-block shrink-0"
              {...getTriggerProps()}
            >
              <BracesIcon className="text-foreground-tertiary icon-sm! mb-0.25" />
            </button>
          )}
        </HoverCard>
      )}
    </span>
  );
};
