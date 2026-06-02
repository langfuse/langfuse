import { z } from "zod";
import { LATEST_PROMPT_LABEL, type Prompt } from "@langfuse/shared";

import { getPromptForApi } from "@/src/features/prompts/server/prompt-api-service";

import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { UserInputError } from "../../../core/errors";
import {
  ParamPromptLabel,
  ParamPromptName,
  ParamPromptVersion,
} from "../validation";

export const PromptReadBaseSchema = z.object({
  name: ParamPromptName,
  label: ParamPromptLabel,
  version: ParamPromptVersion,
});

export const PromptReadInputSchema = PromptReadBaseSchema.refine(
  (data) => !(data.label && data.version),
  {
    message:
      "Cannot specify both label and version - they are mutually exclusive",
  },
);

const formatPromptResponse = (prompt: Prompt) => ({
  id: prompt.id,
  name: prompt.name,
  version: prompt.version,
  type: prompt.type,
  prompt: prompt.prompt,
  labels: prompt.labels,
  tags: prompt.tags,
  config: prompt.config,
  createdAt: prompt.createdAt,
  updatedAt: prompt.updatedAt,
  createdBy: prompt.createdBy,
  projectId: prompt.projectId,
});

const buildPromptNotFoundMessage = (params: {
  name: string;
  label?: string;
  version?: number | null;
}) => {
  const { name, label, version } = params;

  return `Prompt '${name}' not found${label ? ` with label '${label}'` : ""}${version ? ` with version ${version}` : ""}`;
};

type CreatePromptReadToolOptions = {
  name: string;
  description: string;
  resolve: boolean;
  spanName: string;
};

export const createPromptReadTool = (options: CreatePromptReadToolOptions) => {
  const { name, description, resolve, spanName } = options;

  return defineTool({
    name,
    description,
    baseSchema: PromptReadBaseSchema,
    inputSchema: PromptReadInputSchema,
    handler: async (input, context) => {
      const effectiveLabel = input.version
        ? input.label
        : (input.label ?? LATEST_PROMPT_LABEL);

      return await runMcpTool({
        spanName,
        context,
        attributes: {
          "mcp.prompt_name": input.name,
          "mcp.unresolved": resolve ? undefined : true,
          "mcp.prompt_label": effectiveLabel,
          "mcp.prompt_version": input.version ?? undefined,
        },
        fn: async () => {
          const { name, version } = input;

          const prompt = await getPromptForApi({
            promptName: name,
            projectId: context.projectId,
            label: effectiveLabel,
            version,
            resolve,
          });

          if (!prompt) {
            throw new UserInputError(
              buildPromptNotFoundMessage({
                name,
                label: effectiveLabel,
                version,
              }),
            );
          }

          return formatPromptResponse(prompt);
        },
      });
    },
    readOnlyHint: true,
  });
};
