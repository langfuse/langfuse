/**
 * TraceMetadataBadges - Extracted badge components for trace metadata
 *
 * Following the pattern from ObservationDetailView/ObservationMetadataBadgesSimple.tsx
 * Each badge handles its own null check and returns null when data is unavailable.
 */

import Link from "next/link";
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string | null;
  projectId: string;
}) {
  if (!sessionId) return null;

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
  userId: string | null;
  projectId: string;
}) {
  if (!userId) return null;

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
  targetTraceId: string | null;
  projectId: string;
}) {
  if (!targetTraceId) return null;

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

export function EvaluatorBadge({
  evaluatorId,
  environment,
  projectId,
}: {
  evaluatorId: string | null;
  environment: string;
  projectId: string;
}) {
  const isEvaluatorExecution =
    environment === LangfuseInternalTraceEnvironment.LLMJudge ||
    environment === LangfuseInternalTraceEnvironment.CodeEval;
  if (!evaluatorId || !isEvaluatorExecution) return null;

  return (
    <Link
      href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}`}
      className="ph-no-capture inline-flex"
    >
      <Badge color="primary" text="Evaluator" trailingIcon={ExternalLinkIcon} />
    </Link>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null;
}) {
  if (!environment) return null;
  return <Badge text={`Env: ${environment}`} />;
}

export function ReleaseBadge({ release }: { release: string | null }) {
  if (!release) return null;
  return <Badge text={`Release: ${release}`} />;
}

export function VersionBadge({ version }: { version: string | null }) {
  if (!version) return null;
  return <Badge text={`Version: ${version}`} />;
}
