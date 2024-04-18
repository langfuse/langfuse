import { z } from "zod";
import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isEeAvailable } from "@langfuse/ee";
import { isPrismaException } from "@/src/utils/exceptions";
import {
  CreateMemberInput,
  createNewMember,
} from "@/src/features/rbac/lib/createMember";

export async function membershipsHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  // Check EE
  if (!isEeAvailable) {
    res.status(403).json({ error: "EE is not available" });
    return;
  }

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  // CHECK ACCESS SCOPE
  if (authCheck.scope.accessLevel !== "all") {
    return res.status(401).json({
      message: "Access denied - need to use basic auth with secret key",
    });
  }
  // END CHECK ACCESS SCOPE

  try {
    if (req.method === "POST") {
      console.log(
        "Trying to create new member, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const body = CreateMemberInput.parse(req.body);

      await createNewMember({
        newMember: body,
        auditLogSource: {
          publicApiKey: authCheck.publicKey,
          projectId: authCheck.scope.projectId,
        },
      });

      return res.status(200).json({
        message: "Member created",
      });
    } else {
      res.status(405).json({
        message: "Method Not Allowed",
      });
    }
  } catch (error: unknown) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid request data",
        error: error.errors,
      });
    }
    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
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
