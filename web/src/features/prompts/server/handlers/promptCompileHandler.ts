import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { authorizePromptRequestOrThrow } from "../utils/authorizePromptRequest";
import { getPromptByName } from "../actions/getPromptByName";
import {
  InvalidRequestError,
  LangfuseNotFoundError,
  PRODUCTION_LABEL,
  PromptType,
  PromptConfigSchema,
} from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import {
  compileChatMessages,
  compilePromptTemplate,
} from "@langfuse/shared/src/server";

const CompilePromptBodySchema = z.object({
  variables: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().optional(),
  label: z.string().optional(),
});

const postCompileHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizePromptRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "prompts",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const { promptName } = req.query;
  if (typeof promptName !== "string") {
    throw new InvalidRequestError("promptName must be a string");
  }

  const body = CompilePromptBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new InvalidRequestError(body.error.message);
  }

  const { variables, version, label } = body.data;

  if (version !== undefined && label !== undefined) {
    throw new InvalidRequestError("Cannot specify both version and label");
  }

  const prompt = await getPromptByName({
    promptName,
    projectId: authCheck.scope.projectId,
    version,
    label,
  });

  if (!prompt) {
    let errorMessage = `Prompt not found: '${promptName}'`;
    if (version) {
      errorMessage += ` with version ${version}`;
    } else {
      errorMessage += ` with label '${label ?? PRODUCTION_LABEL}'`;
    }
    throw new LangfuseNotFoundError(errorMessage);
  }

  const promptConfig = PromptConfigSchema.parse(
    typeof prompt.config === "object" && prompt.config !== null
      ? prompt.config
      : {},
  );
  const templateFormat = promptConfig.templateFormat ?? "default";

  const compilationErrors: string[] = [];

  let compiledPrompt: unknown;

  if (prompt.type === PromptType.Text && typeof prompt.prompt === "string") {
    const result = compilePromptTemplate(
      prompt.prompt,
      variables,
      templateFormat,
    );
    compilationErrors.push(...result.errors);
    compiledPrompt = result.compiled;
  } else if (prompt.type === PromptType.Chat && Array.isArray(prompt.prompt)) {
    try {
      compiledPrompt = compileChatMessages(
        prompt.prompt as Parameters<typeof compileChatMessages>[0],
        {},
        variables,
        templateFormat,
      );
    } catch (e) {
      compilationErrors.push(String(e));
      compiledPrompt = prompt.prompt;
    }
  } else {
    compiledPrompt = prompt.prompt;
  }

  res.status(200).json({
    ...prompt,
    isActive: prompt.labels.includes(PRODUCTION_LABEL),
    prompt: compiledPrompt,
    compilationErrors:
      compilationErrors.length > 0 ? compilationErrors : undefined,
  });
};

export const promptCompileHandler = withMiddlewares({
  POST: postCompileHandler,
});
