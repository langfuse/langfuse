import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { logger } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { auditLog } from "@/src/features/audit-logs/server";
import {
  authorizeScimGroupsRequest,
  createScimGroup,
  handleScimGroupsError,
  isMembersExcluded,
  listScimGroups,
  parseGroupFilter,
  parseScimBody,
  SCIM_GROUPS_MAX_RESULTS,
  toListResponse,
  toScimGroup,
  writeScimErrorResponse,
} from "@/src/features/scim/server/scimGroups";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET" && req.method !== "POST") {
    logger.error(
      `[SCIM] Method not allowed for ${req.method} on /api/public/scim/Groups`,
    );
    return writeScimErrorResponse(res, 405, "Method not allowed");
  }

  const scope = await authorizeScimGroupsRequest(req, res);
  if (!scope) return;

  logger.info(
    `[SCIM] Received request for /api/public/scim/Groups with method ${req.method} for orgId ${scope.orgId}`,
  );

  try {
    if (req.method === "GET") {
      const startIndex = Math.max(
        parseInt(String(req.query.startIndex ?? "1"), 10) || 1,
        1,
      );
      const parsedCount = parseInt(String(req.query.count ?? ""), 10);
      const count = Math.min(
        Math.max(
          Number.isNaN(parsedCount) ? SCIM_GROUPS_MAX_RESULTS : parsedCount,
          0,
        ),
        SCIM_GROUPS_MAX_RESULTS,
      );
      const { totalResults, groups } = await listScimGroups({
        orgId: scope.orgId,
        where: parseGroupFilter(req.query.filter),
        startIndex,
        count,
      });
      return res
        .status(200)
        .json(
          toListResponse(
            groups,
            totalResults,
            startIndex,
            isMembersExcluded(req),
          ),
        );
    }

    // POST
    const group = await createScimGroup(scope.orgId, parseScimBody(req));
    await auditLog({
      resourceType: "group",
      resourceId: group.id,
      action: "create",
      after: toScimGroup(group),
      apiKeyId: scope.apiKeyId,
      orgId: scope.orgId,
    });
    logger.info(
      `[SCIM] Created group ${group.id} with ${group.members.length} members in org ${scope.orgId}`,
    );
    return res.status(201).json(toScimGroup(group));
  } catch (error) {
    return handleScimGroupsError(res, error, `${req.method} /Groups failed`);
  }
}
