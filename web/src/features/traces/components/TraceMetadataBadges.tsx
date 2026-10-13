/**
 * TraceMetadataBadges - Extracted badge components for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 */

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  return (
    <LinkBadge
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      noCapture
      text="session"
      title={sessionId}
    />
  );
}

export function UserIdBadge({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  const label = "user";
  const text = userId;

  return (
    <LinkBadge
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      noCapture
      label={label}
      text={text}
    />
  );
}

export function TargetTraceBadge({
  targetTraceId,
  projectId,
}: {
  targetTraceId: string;
  projectId: string;
}) {
  const label = "trace";
  const text = targetTraceId;

  return (
    <LinkBadge
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      noCapture
      label={label}
      text={text}
    />
  );
}

export function EnvironmentBadge({ environment }: { environment: string }) {
  return <Badge font="mono" color="ghost" label="env" text={environment} />;
}

export function ReleaseBadge({ release }: { release: string }) {
  return <Badge font="mono" color="ghost" label="release" text={release} />;
}

export function VersionBadge({ version }: { version: string }) {
  return <Badge font="mono" color="ghost" label="version" text={version} />;
}
