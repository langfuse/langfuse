import { z } from "zod";
import type {
  InputRequiredResult,
  ServerContext as McpRequestContext,
} from "@modelcontextprotocol/server";
import { ForbiddenError, LangfuseNotFoundError } from "@langfuse/shared";
import { EvaluatorBlockReason } from "@langfuse/shared/src/db";
import {
  classifyEvaluatorLlmError,
  DefaultEvalModelService,
  getProductBaseUrl,
  logger,
  resolveLlmApiKey,
} from "@langfuse/shared/src/server";
import {
  deleteDefaultEvalModel,
  upsertDefaultEvalModel,
} from "@/src/features/evals/server/defaultEvalModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { requestUrlStep } from "../../../core/url-step";
import type { ServerContext } from "../../../types";
import { McpEvaluatorModelConfigSchema } from "./evaluatorInput";

function isConnectionFailure(
  blockReason: EvaluatorBlockReason | null | undefined,
): boolean {
  return (
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID ||
    blockReason === EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE
  );
}

/** A link to the project's LLM connections page that opens one dialog. */
function llmConnectionsUrl(
  projectId: string,
  dialog: "createConnection" | "editConnection",
  value: string,
): string {
  const url = new URL(
    `project/${projectId}/settings/llm-connections`,
    getProductBaseUrl(),
  );
  url.searchParams.set(dialog, value);
  return url.toString();
}

/**
 * Fixing an LLM connection takes an API key, which the agent must not handle.
 * When the connection is missing, or its test call fails, this sends the user
 * to the settings page to add the connection or to edit its key; the client
 * then runs the call again.
 */
async function requestConnectionFix(params: {
  error: unknown;
  input: { provider: string };
  context: ServerContext;
  mcpRequest: McpRequestContext | undefined;
}): Promise<InputRequiredResult | undefined> {
  const { error, input, context, mcpRequest } = params;

  if (error instanceof LangfuseNotFoundError) {
    return requestUrlStep({
      toolName: "setDefaultEvaluationModel",
      key: "addLlmConnection",
      message: `Add an LLM connection named "${input.provider}" in Langfuse, then continue.`,
      // Prefills the name, so the retry finds the connection.
      url: llmConnectionsUrl(
        context.projectId,
        "createConnection",
        input.provider,
      ),
      input,
      mcpRequest,
    });
  }

  // A failed test call points at the connection only when the provider
  // rejected its credentials or could not be reached; an unknown model or
  // invalid parameters are the agent's to fix. The test call runs only once
  // the connection is found, so it exists.
  if (
    error instanceof ForbiddenError &&
    isConnectionFailure(classifyEvaluatorLlmError(error)?.blockReason)
  ) {
    const connection = await resolveLlmApiKey({
      projectId: context.projectId,
      provider: input.provider,
    });
    if (!connection) return undefined;
    return requestUrlStep({
      toolName: "setDefaultEvaluationModel",
      key: "editLlmConnection",
      message: `The test call with LLM connection "${input.provider}" failed with "${error.message}". Check its API key in Langfuse, then continue.`,
      url: llmConnectionsUrl(
        context.projectId,
        "editConnection",
        connection.id,
      ),
      input,
      mcpRequest,
    });
  }

  return undefined;
}

const GetDefaultEvaluationModelInput = z.object({});
const DeleteDefaultEvaluationModelInput = z.object({});

function toAuditActor(context: ServerContext) {
  return {
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
  };
}

export const [getDefaultEvaluationModelTool, handleGetDefaultEvaluationModel] =
  defineTool({
    name: "getDefaultEvaluationModel",
    description: [
      "Get the project's default evaluation model: the provider, model, and model parameters that LLM-as-a-judge evaluators without their own modelConfig run on.",
      "Returns `defaultModel: null` when no default is configured; such evaluators cannot run until one is set with setDefaultEvaluationModel.",
    ].join(" "),
    action: "evalDefaultModel:read",
    baseSchema: GetDefaultEvaluationModelInput,
    inputSchema: GetDefaultEvaluationModelInput,
    handler: async (_input, context) =>
      runMcpTool({
        spanName: "mcp.default_evaluation_model.get",
        context,
        fn: async () => ({
          defaultModel: await DefaultEvalModelService.fetchDefaultModel(
            context.projectId,
          ),
        }),
      }),
    readOnlyHint: true,
  });

export const [setDefaultEvaluationModelTool, handleSetDefaultEvaluationModel] =
  defineTool({
    name: "setDefaultEvaluationModel",
    description: [
      "Set the project's default evaluation model, replacing the current one. LLM-as-a-judge evaluators without their own modelConfig use it.",
      "Call listLlmConnections to find valid provider names and models. The model is validated with a test call to the provider before it is saved.",
      "Evaluators paused because no default model was configured resume automatically.",
    ].join(" "),
    action: "evalDefaultModel:CUD",
    baseSchema: McpEvaluatorModelConfigSchema,
    inputSchema: McpEvaluatorModelConfigSchema,
    handler: async (input, context, mcpRequest) =>
      runMcpTool({
        spanName: "mcp.default_evaluation_model.set",
        context,
        attributes: {
          "mcp.provider": input.provider,
          "mcp.model": input.model,
        },
        fn: async () => {
          try {
            return await upsertDefaultEvalModel({
              projectId: context.projectId,
              provider: input.provider,
              model: input.model,
              modelParams: input.modelParams,
              actor: toAuditActor(context),
            });
          } catch (error) {
            const urlStep = await requestConnectionFix({
              error,
              input,
              context,
              mcpRequest,
            }).catch((fixError: unknown) => {
              // The link is a convenience: report the original failure.
              logger.warn("MCP could not build the LLM connection link", {
                error: fixError,
              });
              return undefined;
            });
            if (urlStep) return urlStep;
            throw error;
          }
        },
      }),
    destructiveHint: true,
  });

export const [
  deleteDefaultEvaluationModelTool,
  handleDeleteDefaultEvaluationModel,
] = defineTool({
  name: "deleteDefaultEvaluationModel",
  description:
    "Delete the project's default evaluation model. LLM-as-a-judge evaluators without their own modelConfig are paused until a new default is set.",
  action: "evalDefaultModel:CUD",
  baseSchema: DeleteDefaultEvaluationModelInput,
  inputSchema: DeleteDefaultEvaluationModelInput,
  handler: async (_input, context) =>
    runMcpTool({
      spanName: "mcp.default_evaluation_model.delete",
      context,
      fn: async () => {
        await deleteDefaultEvalModel({
          projectId: context.projectId,
          actor: toAuditActor(context),
        });
        return { message: "Default evaluation model successfully deleted" };
      },
    }),
  destructiveHint: true,
});
