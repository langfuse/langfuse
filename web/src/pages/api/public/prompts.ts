import { createPrompt } from "@/src/features/prompts/server/prompt-router";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { jsonSchema } from "@/src/utils/zod";
import { isPrismaException } from "@/src/utils/exceptions";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

const PromptGetSchema = z.object({
  name: z.string(),
  version: z.coerce.number().int().nullish(),
});

const PromptCreateSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  isActive: z.boolean(),
  config: jsonSchema.nullable().default({}),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method === "GET") {
    // CHECK AUTH
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey)
      return res.status(401).json({
        message: authCheck.error,
      });
    // END CHECK AUTH

    try {
      console.log(
        "trying to get prompt, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.query, null, 2),
      );

      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message:
            "Access denied - need to use basic auth with secret key to GET prompts",
        });
      }

      const searchParams = PromptGetSchema.parse(req.query);

      const prompt = await prisma.prompt.findFirst({
        where: {
          projectId: authCheck.scope.projectId,
          name: searchParams.name,
          version: searchParams.version ?? undefined,
          // if no version is given, we take the latest active prompt
          // if no prompt is active, there will be no prompt available
          isActive: !searchParams.version ? true : undefined,
        },
      });

      if (prompt === null) {
        return res.status(404).json({
          message: "Prompt not found",
        });
      }

      return res.status(200).json(prompt);
    } catch (error: unknown) {
      console.error(error);
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
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "POST") {
    // CHECK AUTH
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey)
      return res.status(401).json({
        message: authCheck.error,
      });
    // END CHECK AUTH

    try {
      console.log(
        "trying to create prompt, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message:
            "Access denied - need to use basic auth with secret key to POST prompts",
        });
      }

      const input = PromptCreateSchema.parse(req.body);

      const prompt = await createPrompt({
        projectId: authCheck.scope.projectId,
        name: input.name,
        prompt: input.prompt,
        isActive: input.isActive,
        createdBy: "API",
        config: input.config ?? {},
        prisma: prisma,
      });
      console.log("created prompt", prompt);
      return res.status(200).json(prompt);
    } catch (error: unknown) {
      console.error(error);
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
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    console.error(req.method, req.body, req.query);
    return res.status(405).json({ message: "Method not allowed" });
  }
}
