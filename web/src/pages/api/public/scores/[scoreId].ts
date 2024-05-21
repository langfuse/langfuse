import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";

const ScoreSchema = z.object({
  scoreId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method === "DELETE") {
    try {
      // CHECK AUTH
      const authCheck = await verifyAuthHeaderAndReturnScope(
        req.headers.authorization,
      );
      if (!authCheck.validKey)
        return res.status(401).json({
          message: authCheck.error,
        });
      // END CHECK AUTH
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }

      const { scoreId } = ScoreSchema.parse(req.query); // uses query and not body

      const score = await prisma.score.findUnique({
        select: {
          id: true,
        },
        where: {
          id: scoreId,
          projectId: authCheck.scope.projectId,
        },
      });

      if (!score) {
        return res.status(404).json({
          message: "Score not found within authorized project",
        });
      }

      await prisma.score.delete({
        where: {
          id: scoreId,
          projectId: authCheck.scope.projectId,
        },
      });

      return res.status(200).json({ message: "Score deleted successfully" });
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
  } else if (req.method === "GET") {
    try {
      // CHECK AUTH
      const authCheck = await verifyAuthHeaderAndReturnScope(
        req.headers.authorization,
      );
      if (!authCheck.validKey)
        return res.status(401).json({
          message: authCheck.error,
        });
      // END CHECK AUTH

      const { scoreId } = ScoreSchema.parse(req.query);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      // END CHECK ACCESS SCOPE

      const score = await prisma.score.findUnique({
        where: {
          id: scoreId,
          projectId: authCheck.scope.projectId,
        },
      });

      if (!score) {
        return res.status(404).json({
          message: "Score not found within authorized project",
        });
      }

      return res.status(200).json(score);
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
    return res.status(405).json({ message: "Method not allowed" });
  }
}
