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
  action: "llmApiKeys:update",
  baseSchema: PutLlmConnectionMcpBase,
  inputSchema: PutLlmConnectionV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.llm_connections.upsert",
      context,
      fn: async () => {
        const result = await new LlmConnectionService().upsert({
          owner: {
            type: "project",
            projectId: context.projectId,
            organizationId: context.orgId,
          },
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

export const [
  listOrganizationLlmConnectionsTool,
  handleListOrganizationLlmConnections,
] = defineTool({
  name: "listOrganizationLlmConnections",
  description:
    "List organization LLM connections inherited by projects. Secret values are never returned.",
  action: "organizationLlmApiKeys:read",
  accessLevel: "organization",
  baseSchema: GetLlmConnectionsV1Query,
  inputSchema: GetLlmConnectionsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.organization_llm_connections.list",
      context,
      fn: async () => {
        const result = await new LlmConnectionService().list({
          owner: {
            type: "organization",
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

export const [
  upsertOrganizationLlmConnectionTool,
  handleUpsertOrganizationLlmConnection,
] = defineTool({
  name: "upsertOrganizationLlmConnection",
  description:
    "Create or replace an organization LLM connection by provider. It is inherited by projects without a provider override. The secret is encrypted and never returned.",
  action: "organizationLlmApiKeys:CUD",
  accessLevel: "organization",
  baseSchema: PutLlmConnectionMcpBase,
  inputSchema: PutLlmConnectionV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.organization_llm_connections.upsert",
      context,
      fn: async () => {
        const result = await new LlmConnectionService().upsert({
          owner: {
            type: "organization",
            organizationId: context.orgId,
          },
          input,
          actor: context,
        });
        return PutLlmConnectionV1Response.parse(
          transformDbLlmConnectionToAPI(result.connection),
        );
      },
    }),
});

export const [
  deleteOrganizationLlmConnectionTool,
  handleDeleteOrganizationLlmConnection,
] = defineTool({
  name: "deleteOrganizationLlmConnection",
  description:
    "Delete an organization LLM connection by id. Evaluators in projects without an override are paused.",
  action: "organizationLlmApiKeys:CUD",
  accessLevel: "organization",
  baseSchema: DeleteLlmConnectionV1Query,
  inputSchema: DeleteLlmConnectionV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.organization_llm_connections.delete",
      context,
      fn: async () => {
        await new LlmConnectionService().delete({
          owner: {
            type: "organization",
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
