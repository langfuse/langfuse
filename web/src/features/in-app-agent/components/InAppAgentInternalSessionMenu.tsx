"use client";

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
  const telemetryProject = api.inAppAgent.telemetryProject.useQuery(
    { projectId },
    { meta: { silentAllErrors: true } },
  );

  return (
    <InAppAgentInternalSessionMenuView
      conversationId={conversationId}
      telemetryProject={telemetryProject}
    />
  );
}
