/**
 * Trace metadata pills for detail headers.
 * Each pill handles its own null check and returns null when data is unavailable.
 */

import { ArrowUpRight } from "lucide-react";

import {
  HeaderPill,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";

export function SessionBadge({
  sessionId,
  projectId,
}: {
  sessionId: string | null;
  projectId: string;
}) {
  if (!sessionId) return null;

  return (
    <HeaderPill
      variant="link"
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
    >
      session{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={sessionId}
      >
        {sessionId}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </HeaderPill>
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
    <HeaderPill
      variant="link"
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
    >
      user{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={userId}
      >
        {userId}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </HeaderPill>
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
    <HeaderPill
      variant="link"
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
    >
      target{" "}
      <span
        className="text-foreground group-hover:text-link truncate"
        title={targetTraceId}
      >
        {targetTraceId}
      </span>
      <ArrowUpRight className="text-link h-3 w-3 shrink-0" />
    </HeaderPill>
  );
}

export function EnvironmentBadge({
  environment,
}: {
  environment: string | null;
}) {
  if (!environment) return null;
  return (
    <HeaderPill variant="display">
      env <HeaderPillValue>{environment}</HeaderPillValue>
    </HeaderPill>
  );
}

export function ReleaseBadge({ release }: { release: string | null }) {
  if (!release) return null;
  return (
    <HeaderPill variant="display">
      release <HeaderPillValue>{release}</HeaderPillValue>
    </HeaderPill>
  );
}

export function VersionBadge({ version }: { version: string | null }) {
  if (!version) return null;
  return (
    <HeaderPill variant="display">
      version <HeaderPillValue>{version}</HeaderPillValue>
    </HeaderPill>
  );
}
