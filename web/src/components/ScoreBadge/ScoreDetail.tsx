import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export type DetailedScore =
  | WithStringifiedMetadata<ScoreDomain>
  | LastUserScore;

export const hasMetadata = (score: DetailedScore): boolean => {
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

const executionTraceId = (score: DetailedScore): string | null =>
  "executionTraceId" in score && score.executionTraceId
    ? score.executionTraceId
    : null;

/** Whether a score has more to say than its value: a comment, metadata or
    an execution trace. Cards list only these in full. */
export const hasScoreDetail = (score: DetailedScore): boolean =>
  Boolean(score.comment) ||
  hasMetadata(score) ||
  executionTraceId(score) !== null;

const formatScoreValue = (score: DetailedScore): string =>
  score.stringValue ?? score.value?.toFixed(2) ?? "";

export const ExecutionTraceLink = ({
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

/**
 * Everything one score has to say inside a hover card: value (optional,
 * when the card lists several scores), comment, metadata, execution trace.
 * The per-name chip card and the group chip card render the same block, so
 * a grouped judge score's justification reads exactly as an ungrouped one.
 */
export const ScoreDetail = ({
  score,
  showValue,
  projectId,
}: {
  score: DetailedScore;
  showValue: boolean;
  projectId: string | undefined;
}) => {
  const traceId = executionTraceId(score);
  return (
    <div className="flex flex-col gap-2">
      {showValue ? (
        <p className="text-muted-foreground">{formatScoreValue(score)}</p>
      ) : null}
      {score.comment ? (
        <p className="whitespace-pre-wrap">{score.comment}</p>
      ) : null}
      {hasMetadata(score) ? (
        <JSONView codeClassName="rounded-md!" json={score.metadata} />
      ) : null}
      {traceId && projectId ? (
        <ExecutionTraceLink executionTraceId={traceId} projectId={projectId} />
      ) : null}
    </div>
  );
};
