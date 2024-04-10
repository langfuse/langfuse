import { prisma } from "@langfuse/shared/src/db";
import { Prisma, type Task } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { paginationZod } from "@/src/utils/zod";
import { isPrismaException } from "@/src/utils/exceptions";

const TasksGetSchema = z.object(paginationZod);

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
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }

      const obj = TasksGetSchema.parse(req.query); // uses query and not body

      const skipValue = (obj.page - 1) * obj.limit;

      const tasks = await prisma.$queryRaw<Array<Task>>(Prisma.sql`
          SELECT
            t.id,
            t.name,
            t.description,
            t.created_at as "createdAt",
            t.updated_at as "updatedAt",
            botSchema.schema as "botSchema",
            inputSchema.schema as "inputSchema",
            outputSchema.schema as "outputSchema"
          FROM 
            "tasks" AS t,
            "schemas" AS botSchema,
            "schemas" AS inputSchema,
            "schemas" AS outputSchema
          WHERE 
            t.project_id = ${authCheck.scope.projectId} AND
            botSchema.id = t.bot_schema_id AND
            inputSchema.id = t.input_schema_id AND
            outputSchema.id = t.output_schema_id
          ORDER BY t."created_at" DESC
          LIMIT ${obj.limit} OFFSET ${skipValue}
          `);
      const totalItems = await prisma.task.count();

      return res.status(200).json({
        data: tasks,
        meta: {
          page: obj.page,
          limit: obj.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / obj.limit),
        },
      });
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
