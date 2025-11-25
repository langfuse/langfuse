import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod/v4";
import {
  UnauthorizedError,
  LangfuseNotFoundError,
  BaseError,
  MethodNotAllowedError,
  ForbiddenError,
  type Prompt,
  GetPromptSchema,
  LegacyCreatePromptSchema,
  PRODUCTION_LABEL,
} from "@langfuse/shared";
import {
  PromptService,
  redis,
  recordIncrement,
  traceException,
  logger,
} from "@langfuse/shared/src/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { telemetry } from "@/src/features/telemetry";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    // Authentication and authorization
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);
    if (
      authCheck.scope.accessLevel !== "project" ||
      !authCheck.scope.projectId
    ) {
      throw new ForbiddenError(
        `Access denied: Bearer auth and org api keys are not allowed to access`,
      );
    }

    await telemetry();

    // Handle GET requests
    if (req.method === "GET") {
      const searchParams = GetPromptSchema.parse(req.query);
      const projectId = authCheck.scope.projectId;
      const promptName = searchParams.name;
      const version = searchParams.version ?? undefined;

      const rateLimitCheck =
        await RateLimitService.getInstance().rateLimitRequest(
          authCheck.scope,
          "prompts",
        );

      if (rateLimitCheck?.isRateLimited()) {
        return rateLimitCheck.sendRestResponseIfLimited(res);
      }

      const promptService = new PromptService(prisma, redis, recordIncrement);

      let prompt: Prompt | null = null;

      if (version) {
        prompt = await promptService.getPrompt({
          projectId,
          promptName,
          version,
          label: undefined,
        });
      } else {
        prompt = await promptService.getPrompt({
          projectId,
          promptName,
          label: PRODUCTION_LABEL,
          version: undefined,
        });
      }

      if (!prompt) throw new LangfuseNotFoundError("Prompt not found");

      return res.status(200).json({
        ...prompt,
        isActive: prompt.labels.includes(PRODUCTION_LABEL),
      });
    }

    // Handle POST requests
    if (req.method === "POST") {
      const input = LegacyCreatePromptSchema.parse(req.body);
      const prompt = await createPrompt({
        ...input,
        labels: input.isActive
          ? [...new Set([...input.labels, PRODUCTION_LABEL])] // Ensure labels are unique
          : input.labels, // If production label is already present, this will still promote the prompt
        config: input.config ?? {}, // Config can be null in which case zod default value is not used
        projectId: authCheck.scope.projectId,
        createdBy: "API",
        prisma: prisma,
      });

      return res.status(201).json({
        ...prompt,
        isActive: prompt.labels.includes(PRODUCTION_LABEL),
      });
    }

    throw new MethodNotAllowedError();
  } catch (error: unknown) {
    logger.error(error);
    traceException(error);

    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({
        error: error.name,
        message: error.message,
      });
    }

    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid request data",
        error: error.issues,
      });
    }

    return res.status(500).json({
      message: "Invalid request data",
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}
