import { prisma } from "@/src/server/db";
import { Prisma, type Score } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";

const ScoresGetSchema = z.object({
  scoreId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "DELETE") {
    try {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message:
            "Access denied - need to use basic auth with secret key to GET scores",
        });
      }

      const { scoreId } = ScoresGetSchema.parse(req.query); // uses query and not body

      // check if user is authorized to delete scores in this project
      const scores = await prisma.$queryRaw<
        Array<Score & { trace: { userId: string } }>
      >(Prisma.sql`
          SELECT
            s.id,
            s.timestamp,
            s.name,
            s.value,
            s.comment,
            s.trace_id as "traceId",
            s.observation_id as "observationId",
            json_build_object('userId', t.user_id) as "trace"
          FROM "scores" AS s
          JOIN "traces" AS t ON t.id = s.trace_id
          WHERE t.project_id = ${authCheck.scope.projectId}
          AND s.id = ${scoreId}
          `);

      if (scores.length == 0) {
        return res.status(404).json({
          message: "Score not found within authorized project",
        });
      }

      await prisma.score.delete({
        where: {
          id: scoreId,
        },
      });

      // return with status code 204 and no response body upon successful deletion
      return res.status(204).json({});
    } catch (error: unknown) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}
