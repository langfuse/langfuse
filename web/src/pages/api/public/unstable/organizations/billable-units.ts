import { prisma } from "@langfuse/shared/src/db";
import { getOrgUsageBreakdown } from "@/src/features/organization-usage/server/usageBreakdown";
import { authenticateOrganizationApiRequest } from "@/src/features/public-api/server/authenticateOrganizationApiRequest";
import {
  createStructuredPublicApiRequestValidationError,
  sendStructuredPublicApiErrorResponse,
  structuredPublicApiErrorContract,
} from "@/src/features/public-api/server/structuredPublicApiErrorContract";
import { withUnstablePublicApiMiddlewares } from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetBillableUnitsV1Query,
  GetBillableUnitsV1Response,
} from "@/src/features/public-api/types/unstable-billable-units";

type UsageRow = Awaited<
  ReturnType<typeof getOrgUsageBreakdown>
>["rows"][number];

/** One row per bucket and project, with the total and the count per unit type. */
const toBucketProjectRows = (rows: UsageRow[]) => {
  const byKey = new Map<
    string,
    {
      bucket: string;
      projectId: string;
      count: number;
      traces: number;
      observations: number;
      scores: number;
      topicFacetSummaries: number;
    }
  >();
  for (const row of rows) {
    const key = `${row.bucket}|${row.projectId}`;
    const entry = byKey.get(key) ?? {
      bucket: row.bucket,
      projectId: row.projectId,
      count: 0,
      traces: 0,
      observations: 0,
      scores: 0,
      topicFacetSummaries: 0,
    };
    entry[row.unitType] += row.count;
    entry.count += row.count;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.bucket.localeCompare(b.bucket) ||
      a.projectId.localeCompare(b.projectId),
  );
};

export default withUnstablePublicApiMiddlewares({
  GET: async (req, res) => {
    const scope = await authenticateOrganizationApiRequest(
      req,
      res,
      "organizationUsage:read",
      { errorContract: structuredPublicApiErrorContract },
    );
    if (!scope) return;

    const parsed = GetBillableUnitsV1Query.safeParse(req.query);
    if (!parsed.success) {
      return sendStructuredPublicApiErrorResponse(
        res,
        createStructuredPublicApiRequestValidationError({
          error: parsed.error,
          requestPart: "query",
        }),
      );
    }
    const query = parsed.data;
    const breakdown = await getOrgUsageBreakdown({
      prisma,
      orgId: scope.orgId,
      from: new Date(query.fromTimestamp),
      to: new Date(query.toTimestamp),
      granularity: query.granularity,
    });

    return res.status(200).json(
      GetBillableUnitsV1Response.parse({
        data: toBucketProjectRows(breakdown.rows),
        usageRecordedFrom: breakdown.usageRecordedFrom,
      }),
    );
  },
});
