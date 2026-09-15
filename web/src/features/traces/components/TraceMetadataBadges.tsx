/**
 * TraceMetadataBadges - Extracted badge components for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 */

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  const text = `Session: ${sessionId}`;

  return (
    <Link
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge color="primary" text={text} trailingIcon={ExternalLinkIcon} />
    </Link>
  );
}

export function UserIdBadge({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) {
  const text = `User ID: ${userId}`;

  return (
    <Link
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge color="primary" text={text} trailingIcon={ExternalLinkIcon} />
    </Link>
  );
}

export function TargetTraceBadge({
  targetTraceId,
  projectId,
}: {
  targetTraceId: string;
  projectId: string;
}) {
  const text = `Target Trace: ${targetTraceId}`;

  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge color="primary" text={text} trailingIcon={ExternalLinkIcon} />
    </Link>
  );
}

export function EnvironmentBadge({ environment }: { environment: string }) {
  return <Badge text={`Env: ${environment}`} />;
}

export function ReleaseBadge({ release }: { release: string }) {
  return <Badge text={`Release: ${release}`} />;
}

export function VersionBadge({ version }: { version: string }) {
  return <Badge text={`Version: ${version}`} />;
}
