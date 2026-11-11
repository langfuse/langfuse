import { z } from "zod";
import { DefaultEvalModelService } from "@langfuse/shared/src/server";
import {
  deleteDefaultEvalModel,
  upsertDefaultEvalModel,
} from "@/src/features/evals/server/defaultEvalModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import type { ServerContext } from "../../../types";
import { McpEvaluatorModelConfigSchema } from "./evaluatorInput";

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
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.default_evaluation_model.set",
        context,
        attributes: {
          "mcp.provider": input.provider,
          "mcp.model": input.model,
        },
        fn: async () =>
          upsertDefaultEvalModel({
            projectId: context.projectId,
            provider: input.provider,
            model: input.model,
            modelParams: input.modelParams,
            actor: toAuditActor(context),
          }),
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
