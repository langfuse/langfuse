"use client";

import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { InAppAgentInternalSessionMenuView } from "./InAppAgentInternalSessionMenuView";

/**
 * Debug shortcuts for the Langfuse team: assistant turns are traced into the
 * instance's AI-features project with the conversation id as session id.
 */
export function InAppAgentInternalSessionMenu({
  projectId,
  conversationId,
}: {
  projectId: string;
  conversationId: string;
}) {
  const linksSessions = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "HIPAA";
  const telemetryProject = api.inAppAgent.telemetryProject.useQuery(
    { projectId },
    { enabled: linksSessions, meta: { silentAllErrors: true } },
  );

  return (
    <InAppAgentInternalSessionMenuView
      conversationId={conversationId}
      telemetryProject={linksSessions ? telemetryProject : null}
    />
  );
}
