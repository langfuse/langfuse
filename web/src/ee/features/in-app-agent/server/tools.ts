import { createTool } from "@mastra/core/tools";
import { assertUnreachable } from "@/src/utils/types";
import {
  buildDashboardsPath,
  buildDatasetsPath,
  buildEvalsPath,
  buildExperimentsPath,
  buildModelsPath,
  buildMonitorsPath,
  buildPlaygroundPath,
  buildProjectMembersPath,
  buildProjectSettingsPath,
  buildPromptsPath,
  buildScoresPath,
  buildSessionPath,
  buildSessionsPath,
  buildTracePath,
  buildTracesPath,
} from "@/src/utils/product-url";
import {
  IN_APP_AGENT_REDIRECT_TOOL_NAME,
  InAppAgentRedirectToolInputSchema,
  type InAppAgentRedirectToolInput,
} from "@/src/ee/features/in-app-agent/schema";

export function createRedirectActionTool({
  projectId,
  isV4Enabled,
}: {
  projectId: string;
  isV4Enabled: boolean;
}) {
  return createTool({
    id: IN_APP_AGENT_REDIRECT_TOOL_NAME,
    description:
      "Propose a user-confirmed navigation action to a known Langfuse page. This does not navigate automatically.",
    inputSchema: InAppAgentRedirectToolInputSchema,
    execute: async (input) => {
      return getRedirectActionToolResult({
        input,
        projectId,
        isV4Enabled,
      });
    },
  });
}

function getRedirectActionToolResult({
  input,
  projectId,
  isV4Enabled,
}: {
  input: unknown;
  projectId: string;
  isV4Enabled: boolean;
}) {
  const parsedInput = InAppAgentRedirectToolInputSchema.parse(input);
  const href = getRedirectHref(parsedInput, projectId, isV4Enabled);

  return {
    type: "redirectAction" as const,
    label: parsedInput.label,
    href,
  };
}

function getRedirectHref(
  input: InAppAgentRedirectToolInput,
  projectId: string,
  isV4Enabled: boolean,
): string {
  if (input.destination === "dashboards") {
    return buildDashboardsPath({ projectId });
  }

  if (input.destination === "datasets") {
    return buildDatasetsPath({
      projectId,
      folder: input.params?.folder,
    });
  }

  if (input.destination === "evals") {
    return buildEvalsPath({ projectId });
  }

  if (input.destination === "experiments") {
    return buildExperimentsPath({ projectId });
  }

  if (input.destination === "models") {
    return buildModelsPath({ projectId });
  }

  if (input.destination === "monitors") {
    return buildMonitorsPath({ projectId });
  }

  if (input.destination === "playground") {
    return buildPlaygroundPath({ projectId });
  }

  if (input.destination === "projectMembers") {
    return buildProjectMembersPath({ projectId });
  }

  if (input.destination === "projectSettings") {
    return buildProjectSettingsPath({
      projectId,
      page: input.params?.page,
    });
  }

  if (input.destination === "prompts") {
    return buildPromptsPath({
      projectId,
      folder: input.params?.folder,
    });
  }

  if (input.destination === "scores") {
    return buildScoresPath({ projectId });
  }

  if (input.destination === "session") {
    return buildSessionPath({
      projectId,
      sessionId: input.params.sessionId,
    });
  }

  if (input.destination === "sessions") {
    return buildSessionsPath({ projectId });
  }

  if (input.destination === "trace") {
    return buildTracePath({
      projectId,
      traceId: input.params.traceId,
      timestamp: input.params.timestamp,
    });
  }

  if (input.destination === "traces") {
    return buildTracesPath({
      projectId,
      isV4Enabled,
      params: input.params,
    });
  }

  return assertUnreachable(input);
}
