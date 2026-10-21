import { z } from "zod";
import { LLMConnectionConfigSchema } from "@langfuse/shared";

import { LlmConnectionService } from "@/src/features/llm-api-key/server";
import { BedrockAuthMethodSchema } from "@/src/features/llm-api-key/types";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const ListLlmConnectionsInput = z.object({});

// Non-strict object: parsing strips every field not listed here, so the tool
// can only ever return connection metadata.
const LlmConnectionOutput = z.object({
  id: z.string(),
  provider: z.string(),
  adapter: z.string(),
  scope: z.enum(["project", "organization"]),
  displaySecretKey: z.string(),
  baseURL: z.string().nullable(),
  customModels: z.array(z.string()),
  withDefaultModels: z.boolean(),
  availableModels: z.array(z.string()),
  config: LLMConnectionConfigSchema.nullable(),
  authMethod: BedrockAuthMethodSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
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
