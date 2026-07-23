/**
 * TraceMetadataBadges - Overview-grid rows for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 * Each row handles its own null check and returns null when data is unavailable.
 * Rendered inside `OverviewGrid` (see _shared/InspectorElements).
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { OverviewRow } from "@/src/components/trace/components/_shared/InspectorElements";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string | null;
  projectId: string;
}) {
  if (!sessionId) return null;

  return (
    <OverviewRow label="Session" title={sessionId}>
      <Link
        href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
        className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
      >
        <span className="truncate" title={sessionId}>
          {sessionId}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" />
      </Link>
    </OverviewRow>
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
    <OverviewRow label="User" title={userId}>
      <Link
        href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
        className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
      >
        <span className="truncate" title={userId}>
          {userId}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" />
      </Link>
    </OverviewRow>
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
    <OverviewRow label="Target Trace" title={targetTraceId}>
      <Link
        href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
        className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
      >
        <span className="truncate" title={targetTraceId}>
          {targetTraceId}
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0" />
      </Link>
    </OverviewRow>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null;
}) {
  if (!environment) return null;
  return (
    <OverviewRow label="Env" title={environment}>
      {environment}
    </OverviewRow>
  );
}

export function ReleaseBadge({ release }: { release: string | null }) {
  if (!release) return null;
  return (
    <OverviewRow label="Release" title={release}>
      {release}
    </OverviewRow>
  );
}

export function VersionBadge({ version }: { version: string | null }) {
  if (!version) return null;
  return (
    <OverviewRow label="Version" title={version}>
      {version}
    </OverviewRow>
  );
}
