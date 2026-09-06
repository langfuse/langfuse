/**
 * TraceMetadataBadges - Extracted badge components for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 * Each badge handles its own null check and returns null when data is unavailable.
 */

import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { useTranslations } from "next-intl";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string | null;
  projectId: string;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!sessionId) return null;

  const text = t("session", { value: sessionId });

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
  userId: string | null;
  projectId: string;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!userId) return null;

  const text = t("userId", { value: userId });

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
  targetTraceId: string | null;
  projectId: string;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!targetTraceId) return null;

  const text = t("targetTrace", { value: targetTraceId });

  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge color="primary" text={text} trailingIcon={ExternalLinkIcon} />
    </Link>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null;
}) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!environment) return null;
  return <Badge text={t("environment", { value: environment })} />;
}

export function ReleaseBadge({ release }: { release: string | null }) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!release) return null;
  return <Badge text={t("release", { value: release })} />;
}

export function VersionBadge({ version }: { version: string | null }) {
  const t = useTranslations("coreDetails.traces.detailControls");
  if (!version) return null;
  return <Badge text={t("version", { value: version })} />;
}
