import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { isPrismaException } from "@/src/utils/exceptions";
import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

const GetPromptSchema = z.object({
  promptName: z.string(),
  version: z.coerce.number().optional(),
  active: z.coerce.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);
  if (req.method !== "GET") {
    console.error(req.method, req.body, req.query);
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey)
      return res.status(401).json({
        message: authCheck.error,
      });

    if (authCheck.scope.accessLevel !== "all") {
      return res.status(401).json({
        message:
          "Access denied - need to use basic auth with secret key to GET traces",
      });
    }

    console.log("Trying to get prompt:", req.body, req.query);

    const { promptName, version, active } = GetPromptSchema.parse(req.query);
    const decodedPromptName = decodeURIComponent(promptName)

    if (version && active) {
      return res.status(404).json({
        message: "Cannot use the active and version query parameters together",
      });
    }

    const prompt = await prisma.prompt.findMany({
      where: {
        name: decodedPromptName,
        projectId: authCheck.scope.projectId,
        version: version,
        isActive: active,
      },
      orderBy: [
        {
          version: "desc"
        }
      ]
    });

    console.log("Result: ", prompt);

    if (!prompt) {
      return res.status(404).json({
        message: "Prompt not found within authorized project",
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
}
