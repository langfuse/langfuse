import {
  DeleteLlmConnectionV1Query,
  DeleteLlmConnectionV1Response,
  GetLlmConnectionsV1Query,
  GetLlmConnectionsV1Response,
  PutLlmConnectionV1Body,
  PutLlmConnectionV1BodyBase,
  PutLlmConnectionV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";
import { LlmConnectionService } from "@/src/features/llm-api-key/server/llmConnectionService";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { runMcpTool } from "../../core/run-mcp-tool";
import { paginationMeta } from "../publicApi";

const PutLlmConnectionMcpBase = PutLlmConnectionV1BodyBase.omit({
  baseURL: true,
  config: true,
}).extend({
  baseURL: z.url().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export const [listLlmConnectionsTool, handleListLlmConnections] = defineTool({
  name: "listLlmConnections",
  description:
    "List LLM connections configured directly on the current project. Secret values are never returned.",
  action: "llmApiKeys:read",
  baseSchema: GetLlmConnectionsV1Query,
  inputSchema: GetLlmConnectionsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.llm_connections.list",
      context,
      fn: async () => {
        const result = await new LlmConnectionService().list({
          owner: {
            type: "project",
            projectId: context.projectId,
            organizationId: context.orgId,
          },
          page: input.page,
          limit: input.limit,
        });
        return GetLlmConnectionsV1Response.parse({
          data: result.data.map(transformDbLlmConnectionToAPI),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems: result.totalCount,
          }),
        });
      },
    }),
  readOnlyHint: true,
});

export const [upsertLlmConnectionTool, handleUpsertLlmConnection] = defineTool({
  name: "upsertLlmConnection",
  description:
    "Create or replace a project LLM connection by provider. The secret is encrypted and never returned.",
  action: "llmApiKeys:create",
  baseSchema: PutLlmConnectionMcpBase,
  inputSchema: PutLlmConnectionV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.llm_connections.upsert",
      context,
      fn: async () => {
        const service = new LlmConnectionService();
        const owner = {
          type: "project" as const,
          projectId: context.projectId,
          organizationId: context.orgId,
        };
        if (
          await service.exists({
            owner,
            provider: input.provider,
          })
        ) {
          const decision = shadowAuthorize({
            ctx: context.auth,
            action: "llmApiKeys:update",
            resource: { projectId: context.projectId },
            legacyDecision: {
              success: true,
              scope: { accessLevel: context.accessLevel },
            },
          });
          if (!decision.success) throw decision.error;
        }

        const result = await service.upsert({
          owner,
          input,
          actor: context,
        });
        return PutLlmConnectionV1Response.parse(
          transformDbLlmConnectionToAPI(result.connection),
        );
      },
    }),
});

export const [deleteLlmConnectionTool, handleDeleteLlmConnection] = defineTool({
  name: "deleteLlmConnection",
  description:
    "Delete a project LLM connection by id. Evaluators that depend on it are paused.",
  action: "llmApiKeys:delete",
  baseSchema: DeleteLlmConnectionV1Query,
  inputSchema: DeleteLlmConnectionV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.llm_connections.delete",
      context,
      fn: async () => {
        await new LlmConnectionService().delete({
          owner: {
            type: "project",
            projectId: context.projectId,
            organizationId: context.orgId,
          },
          id: input.id,
          actor: context,
        });
        return DeleteLlmConnectionV1Response.parse({
          message: "LLM connection successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
