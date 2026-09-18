/**
 * TraceMetadataBadges - Extracted badge components for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  const label = "session";
  const text = sessionId;

  return (
    <Link
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge
        label={label}
        text={text}
        trailingIcon={ArrowUpRight}
        trailingIconTone="link"
      />
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
  const label = "user";
  const text = userId;

  return (
    <Link
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge
        label={label}
        text={text}
        trailingIcon={ArrowUpRight}
        trailingIconTone="link"
      />
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
  const label = "trace";
  const text = targetTraceId;

  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge
        label={label}
        text={text}
        trailingIcon={ArrowUpRight}
        trailingIconTone="link"
      />
    </Link>
  );
}

export function EnvironmentBadge({ environment }: { environment: string }) {
  return <Badge label="env" text={environment} />;
}

export function ReleaseBadge({ release }: { release: string }) {
  return <Badge label="release" text={release} />;
}

export function VersionBadge({ version }: { version: string }) {
  return <Badge label="version" text={version} />;
}
