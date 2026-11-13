/* eslint-disable @repo/component-file-structure */
/**
 * TraceMetadataBadges - Extracted badge components for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 */

import { Metric } from "@/src/components/design-system/Metric/Metric";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  return (
    <Metric
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      noCapture
      value="session"
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
    <Metric
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      noCapture
      label={label}
      value={text}
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
    <Metric
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      noCapture
      label={label}
      value={text}
    />
  );
}

export function EnvironmentBadge({ environment }: { environment: string }) {
  return <Metric label="env" value={environment} />;
}

export function ReleaseBadge({ release }: { release: string }) {
  return <Metric label="release" value={release} />;
}

export function VersionBadge({ version }: { version: string }) {
  return <Metric label="version" value={version} />;
}
