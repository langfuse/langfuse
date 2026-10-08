import { type LlmApiKeys } from "@prisma/client";

import { LLMApiKeySchema, type LLMApiKey } from "../../llm/types";
import { LlmApiKeyRepository } from "../../repositories/llm-api-keys";

export type EffectiveLlmApiKey = {
  connection: LLMApiKey;
  scope: "project" | "organization";
  organizationConnectionId?: string;
};

export class LlmApiKeyService {
  constructor(
    private readonly repository: Pick<
      LlmApiKeyRepository,
      "findByProjectAndOrganization"
    > = new LlmApiKeyRepository(),
  ) {}

  async resolve(params: {
    projectId: string;
    provider: string;
  }): Promise<LLMApiKey | null> {
    const owners = await this.repository.findByProjectAndOrganization(params);
    if (!owners) {
      return null;
    }

    const connection =
      owners.connections.find(
        (candidate) => candidate.projectId === params.projectId,
      ) ??
      owners.connections.find(
        (candidate) => candidate.organizationId === owners.organizationId,
      );

    return connection
      ? this.toProjectConnection(connection, params.projectId)
      : null;
  }

  async listEffective(projectId: string): Promise<EffectiveLlmApiKey[]> {
    const owners = await this.repository.findByProjectAndOrganization({
      projectId,
    });
    if (!owners) {
      return [];
    }

    const organizationConnections = new Map(
      owners.connections
        .filter(
          (connection) => connection.organizationId === owners.organizationId,
        )
        .map((connection) => [connection.provider, connection]),
    );
    const projectConnections = new Map(
      owners.connections
        .filter((connection) => connection.projectId === projectId)
        .map((connection) => [connection.provider, connection]),
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
        connection: this.toProjectConnection(connection, projectId),
        scope: projectConnection ? "project" : "organization",
        ...(projectConnection && organizationConnection
          ? { organizationConnectionId: organizationConnection.id }
          : {}),
      };
    });
  }

  private toProjectConnection(
    connection: LlmApiKeys,
    projectId: string,
  ): LLMApiKey {
    const { organizationId: _organizationId, ...storedConnection } = connection;

    return LLMApiKeySchema.parse({
      ...storedConnection,
      projectId,
    });
  }
}

export const resolveLlmApiKey = (params: {
  projectId: string;
  provider: string;
}): Promise<LLMApiKey | null> => new LlmApiKeyService().resolve(params);

export const listEffectiveLlmApiKeys = (
  projectId: string,
): Promise<EffectiveLlmApiKey[]> =>
  new LlmApiKeyService().listEffective(projectId);
