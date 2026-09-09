/* eslint-disable @repo/no-null-render */
/**
 * Trace-level metadata pills for the trace summary strip and detail headers.
 *
 * Rendered through the session header's pill primitive
 * (`ModernSessionHeaderPill`) so trace and session chips are indistinguishable.
 * Each element handles its own null check and returns null when the data is
 * unavailable.
 */

import { ArrowUpRight } from "lucide-react";
import { ModernSessionHeaderPill } from "@/src/components/session/ModernSessionHeaderPill";
import {
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string | null;
  projectId: string;
}) {
  if (!sessionId) return null;

  return (
    <ModernSessionHeaderPill
      variant="link"
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      maskFromSessionReplay
    >
      session{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={sessionId}
      >
        {sessionId}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </ModernSessionHeaderPill>
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
    <ModernSessionHeaderPill
      variant="link"
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      maskFromSessionReplay
    >
      user{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={userId}
      >
        {userId}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </ModernSessionHeaderPill>
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
    <ModernSessionHeaderPill
      variant="link"
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      maskFromSessionReplay
    >
      target trace{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={targetTraceId}
      >
        {targetTraceId}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </ModernSessionHeaderPill>
  );
}

// Context text (env/release/version) is shared with the observation header so
// both surfaces speak the same visual grammar.
export { EnvironmentBadge, ReleaseBadge, VersionBadge };
