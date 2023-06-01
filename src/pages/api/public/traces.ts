import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const CreateTraceSchema = z.object({
  name: z.string(),
  attributes: z.record(z.string(), z.any()),
  status: z.enum(["SUCCESS", "ERROR", "EXECUTING"]),
  statusMessage: z.string().optional(),
});

const UpdateTraceSchema = z.object({
  id: z.string(),
  status: z.enum(["SUCCESS", "ERROR", "EXECUTING"]),
  statusMessage: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST" && req.method !== "PATCH") {
    console.log(req.method, req.body);
    return res.status(405).json({ message: "Method not allowed" });
  }

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      success: false,
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "POST") {
    try {
      const { name, attributes, status, statusMessage } =
        CreateTraceSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all")
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      const newTrace = await prisma.trace.create({
        data: {
          timestamp: new Date(),
          projectId: authCheck.scope.projectId,
          name,
          attributes,
          status,
          statusMessage,
        },
      });

      res.status(201).json(newTrace);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "PATCH") {
    try {
      const { id, status, statusMessage } = UpdateTraceSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(authCheck.scope, [
        { type: "trace", id },
      ]);
      if (!accessCheck)
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      const updatedTrace = await prisma.trace.update({
        where: {
          id,
        },
        data: {
          status,
          statusMessage,
        },
      });

      res.status(201).json(updatedTrace);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  }
}
