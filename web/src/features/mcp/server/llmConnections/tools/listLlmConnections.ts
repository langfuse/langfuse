import { z } from "zod";
import { LLMApiKeySchema, LLMConnectionConfigSchema } from "@langfuse/shared";

import { LlmConnectionService } from "@/src/features/llm-api-key/server";
import { BedrockAuthMethodSchema } from "@/src/features/llm-api-key";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const ListLlmConnectionsInput = z.object({});

/** Non-strict copy of the strict LLMApiKeySchema; parsing strips unpicked fields so only connection metadata is returned. */
const LlmConnectionOutput = z
  .object(LLMApiKeySchema.shape)
  .pick({
    id: true,
    provider: true,
    adapter: true,
    displaySecretKey: true,
    baseURL: true,
    customModels: true,
    withDefaultModels: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    scope: z.enum(["project", "organization"]),
    availableModels: z.array(z.string()),
    config: LLMConnectionConfigSchema.nullable(),
    authMethod: BedrockAuthMethodSchema.optional(),
  });

export const [listLlmConnectionsTool, handleListLlmConnections] = defineTool({
  name: "listLlmConnections",
  description: [
    "List the LLM connections usable in the current project, including connections inherited from the organization. A project connection replaces an organization connection with the same provider name.",
    "`provider` is a user-chosen name, not the vendor; use `adapter` to identify the API (e.g. openai, anthropic, bedrock). Pass `provider` and one of `availableModels` as an evaluator's modelConfig.",
    "Returns metadata only, never credentials.",
  ].join(" "),
  action: "llmApiKeys:read",
  baseSchema: ListLlmConnectionsInput,
  inputSchema: ListLlmConnectionsInput,
  handler: async (_input, context) =>
    runMcpTool({
      spanName: "mcp.llm_connections.list",
      context,
      fn: async () => {
        const { data } =
          await new LlmConnectionService().listEffectiveWithAvailableModels({
            owner: {
              type: "project",
              projectId: context.projectId,
              organizationId: context.orgId,
            },
            includeDecisionModels: true,
          });

        return { data: z.array(LlmConnectionOutput).parse(data) };
      },
    }),
  readOnlyHint: true,
});
