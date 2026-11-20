import { logger } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  authorizeScimGroupsRequest,
  deleteScimGroup,
  getScimGroup,
  handleScimGroupsError,
  isMembersExcluded,
  parseScimBody,
  patchScimGroup,
  replaceScimGroup,
  toScimGroup,
  writeScimErrorResponse,
} from "@/src/features/scim/server/scimGroups";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const scope = await authorizeScimGroupsRequest(req, res, {
    route: "/api/public/scim/Groups/[id]",
    methods: ["GET", "PUT", "PATCH", "DELETE"],
  });
  if (!scope) return;

  const groupId = req.query.id as string;
  const excludeMembers = isMembersExcluded(req);
  logger.info(
    `[SCIM] Received request for /api/public/scim/Groups/[id] with method ${req.method} for orgId ${scope.orgId} and groupId ${groupId}`,
  );

  try {
    // Groups of other orgs are a 404
    const existing = await getScimGroup(scope.orgId, groupId);
    if (!existing) {
      return writeScimErrorResponse(res, 404, "Group not found");
    }

    switch (req.method) {
      case "GET":
        return res.status(200).json(toScimGroup(existing, { excludeMembers }));

      case "PUT":
      case "PATCH": {
        const body = parseScimBody(req);
        const updated =
          req.method === "PUT"
            ? await replaceScimGroup(scope.orgId, groupId, body)
            : await patchScimGroup(scope.orgId, groupId, body);
        await auditLog({
          resourceType: "group",
          resourceId: groupId,
          action: "update",
          before: toScimGroup(existing),
          after: toScimGroup(updated),
          apiKeyId: scope.apiKeyId,
          orgId: scope.orgId,
        });
        return res.status(200).json(toScimGroup(updated, { excludeMembers }));
      }

      case "DELETE": {
        await deleteScimGroup(scope.orgId, groupId);
        await auditLog({
          resourceType: "group",
          resourceId: groupId,
          action: "delete",
          before: toScimGroup(existing),
          apiKeyId: scope.apiKeyId,
          orgId: scope.orgId,
        });
        logger.info(`[SCIM] Deleted group ${groupId} in org ${scope.orgId}`);
        return res.status(204).end();
      }
    }
  } catch (error) {
    return handleScimGroupsError(
      res,
      error,
      `${req.method} /Groups/${groupId} failed`,
    );
  }
}
