/* eslint-disable @repo/no-null-render */
/**
 * Trace-level metadata text for the trace summary strip and detail headers.
 *
 * Links and context render as quiet text, not chips — chips are reserved for
 * user-defined tags. Each element handles its own null check and returns null
 * when the data is unavailable.
 */

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import {
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";

const META_LINK_CLASSES =
  "ph-no-capture text-muted-foreground hover:text-foreground inline-flex max-w-48 items-center gap-1 text-xs hover:underline";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string | null;
  projectId: string;
}) {
  if (!sessionId) return null;

  return (
    <Link
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      className={META_LINK_CLASSES}
      title={`Session: ${sessionId}`}
    >
      {/* Label-only link: the raw session id is noise here; the tooltip
          carries it and the link leads to the session itself. */}
      <span className="truncate" title={`Session: ${sessionId}`}>
        Session
      </span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

export function UserIdBadge({
  userId,
  projectId,
}: {
  userId: string | null;
  projectId: string;
}) {
  if (!userId) return null;

  return (
    <Link
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      className={META_LINK_CLASSES}
      title={`User: ${userId}`}
    >
      {/* Unlike sessions, the user id itself carries meaning (it is often an
          email), so it renders in full; only the "User ID:" label is dropped. */}
      <span className="truncate" title={`User: ${userId}`}>
        {userId}
      </span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

export function TargetTraceBadge({
  targetTraceId,
  projectId,
}: {
  targetTraceId: string | null;
  projectId: string;
}) {
  if (!targetTraceId) return null;

  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      className={META_LINK_CLASSES}
      title={`Target trace: ${targetTraceId}`}
    >
      <span className="truncate" title={`Target trace: ${targetTraceId}`}>
        Target trace
      </span>
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

// Context text (env/release/version) is shared with the observation header so
// both surfaces speak the same visual grammar.
export { EnvironmentBadge, ReleaseBadge, VersionBadge };
