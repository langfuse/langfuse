import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";
import { strictJsonSchema } from "@/src/utils/zod";

const TaskSchema = z.object({
  name: z.string(),
  botSchema: strictJsonSchema,
  inputSchema: strictJsonSchema,
  outputSchema: strictJsonSchema,
  // If we want to validate that the request is valid without actually creating a new task
  // This is helpful within a CI check on our main application. Then when when new tasks
  // are merged on our primary application, validateOnly can be set to false and we can
  // create the task.
  validateOnly: z.boolean().optional(),
});

/**
 * This endpoint is idempotent. If a task with the same name and schema already exists, it returns
 * it. If not, it creates a new task.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method === "POST") {
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

      console.log("-->", req.body);

      const { name, botSchema, inputSchema, outputSchema, validateOnly } =
        TaskSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      // END CHECK ACCESS SCOPE

      const task = await prisma.$transaction(async (tx) => {
        const record = await tx.task.findFirst({
          where: {
            projectId: authCheck.scope.projectId,
            name,
          },
          include: {
            botSchema: true,
            inputSchema: true,
            outputSchema: true,
          },
        });

        if (record) {
          if (
            record.botSchema.schema !== botSchema ||
            record.inputSchema.schema !== botSchema ||
            record.outputSchema.schema !== botSchema
          ) {
            throw new Error(
              `Schema mismatch! ${name} is already registered with a different contract.`,
            );
          }

          if (validateOnly) {
            return true;
          }

          return record;
        }

        if (validateOnly) {
          return true;
        }

        console.log("1");

        const botSchemaRecord = await tx.schema.create({
          data: {
            schema: botSchema,
            projectId: authCheck.scope.projectId,
            uiSchema: {}, // <-- This can be modified from Langfuse UI
          },
        });

        console.log("2");

        const inputSchemaRecord = await tx.schema.create({
          data: {
            schema: inputSchema,
            projectId: authCheck.scope.projectId,
            uiSchema: {}, // <-- This can be modified from Langfuse UI
          },
        });

        console.log("3");

        const outputSchemaRecord = await tx.schema.create({
          data: {
            schema: outputSchema,
            projectId: authCheck.scope.projectId,
            uiSchema: {}, // <-- This can be modified from Langfuse UI
          },
        });

        return await tx.task.create({
          data: {
            name,
            botSchemaId: botSchemaRecord.id,
            inputSchemaId: inputSchemaRecord.id,
            outputSchemaId: outputSchemaRecord.id,
            projectId: authCheck.scope.projectId,
          },
        });
      });

      return res.status(200).json(task);
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
