import { z } from "zod";
import { SpanKind } from "@opentelemetry/api";
import { type Prompt } from "@langfuse/shared";
import { instrumentAsync } from "@langfuse/shared/src/server";

import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";

import { defineTool } from "../../../core/define-tool";
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
      return await instrumentAsync(
        { name: spanName, spanKind: SpanKind.INTERNAL },
        async (span) => {
          const { name, label, version } = input;

          span.setAttributes({
            "langfuse.project.id": context.projectId,
            "langfuse.org.id": context.orgId,
            "mcp.api_key_id": context.apiKeyId,
            "mcp.prompt_name": name,
          });

          if (!resolve) {
            span.setAttribute("mcp.unresolved", true);
          }

          if (label) {
            span.setAttribute("mcp.prompt_label", label);
          }

          if (version) {
            span.setAttribute("mcp.prompt_version", version);
          }

          const prompt = await getPromptByName({
            promptName: name,
            projectId: context.projectId,
            label,
            version,
            resolve,
          });

          if (!prompt) {
            throw new UserInputError(
              buildPromptNotFoundMessage({
                name,
                label,
                version,
              }),
            );
          }

          return formatPromptResponse(prompt);
        },
      );
    },
    readOnlyHint: true,
  });
};
