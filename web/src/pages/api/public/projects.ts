import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";

import { type NextApiRequest, type NextApiResponse } from "next";

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

  if (req.method === "GET") {
    try {
      const projects = await prisma.project.findMany({
        where: {
          id: authCheck.scope.projectId,
        },
      });

      return res.status(200).json({
        data: projects.map((project) => ({
          id: project.id,
          name: project.name,
        })),
      });
    } catch (error) {
      console.error(error);
      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
        });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  } else {
    console.error(
      `Method not allowed for ${req.method} on /api/public/projects`,
    );
    return res.status(405).json({ message: "Method not allowed" });
  }
}
