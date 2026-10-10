import { type LlmApiKeys } from "@prisma/client";

import { LLMApiKeySchema, type LLMApiKey } from "../../llm/types";
import { findProjectLlmApiKeyCandidates } from "./LlmApiKeyRepository";

export type EffectiveLlmApiKey = {
  connection: LLMApiKey;
  scope: "project" | "organization";
  organizationConnectionId?: string;
};

const toProjectConnection = (
  connection: LlmApiKeys,
  projectId: string,
): LLMApiKey => {
  const { organizationId: _organizationId, ...storedConnection } = connection;

  return LLMApiKeySchema.parse({
    ...storedConnection,
    projectId,
  });
};

export async function resolveLlmApiKey(params: {
  projectId: string;
  provider: string;
}): Promise<LLMApiKey | null> {
  const candidates = await findProjectLlmApiKeyCandidates(params);
  if (!candidates) {
    return null;
  }

  const connection =
    candidates.projectConnections[0] ?? candidates.organizationConnections[0];

  return connection ? toProjectConnection(connection, params.projectId) : null;
}

export async function listEffectiveLlmApiKeys(
  projectId: string,
): Promise<EffectiveLlmApiKey[]> {
  const candidates = await findProjectLlmApiKeyCandidates({ projectId });
  if (!candidates) {
    return [];
  }

  const organizationConnections = new Map(
    candidates.organizationConnections.map((connection) => [
      connection.provider,
      connection,
    ]),
  );
  const projectConnections = new Map(
    candidates.projectConnections.map((connection) => [
      connection.provider,
      connection,
    ]),
  );

  const providers = new Set([
    ...organizationConnections.keys(),
    ...projectConnections.keys(),
  ]);

  return Array.from(providers, (provider): EffectiveLlmApiKey => {
    const projectConnection = projectConnections.get(provider);
    const organizationConnection = organizationConnections.get(provider);
    const connection = projectConnection ?? organizationConnection;

    if (!connection) {
      throw new Error(`LLM connection "${provider}" could not be resolved`);
    }

    return {
      connection: toProjectConnection(connection, projectId),
      scope: projectConnection ? "project" : "organization",
      ...(projectConnection && organizationConnection
        ? { organizationConnectionId: organizationConnection.id }
        : {}),
    };
  });
}
