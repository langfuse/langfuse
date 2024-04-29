import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import {
  LegacyCreatePromptSchema,
  GetPromptSchema,
} from "@/src/features/prompts/server/utils/validation";
import {
  UnauthorizedError,
  LangfuseNotFoundError,
  BaseError,
  MethodNotAllowedError,
  ForbiddenError,
} from "@langfuse/shared";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    // Authentication and authorization
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);
    if (authCheck.scope.accessLevel !== "all")
      throw new ForbiddenError(
        `Access denied - need to use basic auth with secret key to ${req.method} prompts`,
      );

    // Handle GET requests
    if (req.method === "GET") {
      const searchParams = GetPromptSchema.parse(req.query);
      const prompt = await prisma.prompt.findFirst({
        where: {
          projectId: authCheck.scope.projectId,
          name: searchParams.name,
          version: searchParams.version ?? undefined, // if no version is given, we take the latest active prompt
          labels: !searchParams.version
            ? {
                has: PRODUCTION_LABEL,
              }
            : undefined, // if no prompt is active, there will be no prompt available
        },
      });

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
    console.error(error);

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
        error: error.errors,
      });
    }

    return res.status(500).json({
      message: "Invalid request data",
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
}
