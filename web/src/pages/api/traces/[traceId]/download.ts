import { InvalidRequestError, UnauthorizedError } from "@langfuse/shared";
import { stringify } from "@langfuse/shared/src/server";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  buildTraceExport,
  type TraceExportAccessSession,
} from "@/src/features/traces/server/buildTraceExport";
import { getServerAuthSession } from "@/src/server/auth";
import { z } from "zod";

const querySchema = z.object({
  traceId: z.string().min(1),
  projectId: z.string().min(1),
});

function getTraceExportSession(
  session: Awaited<ReturnType<typeof getServerAuthSession>>,
): TraceExportAccessSession {
  if (!session) {
    return null;
  }

  const { user } = session;

  if (
    !user ||
    typeof user.email !== "string" ||
    !Array.isArray(user.organizations)
  ) {
    throw new UnauthorizedError("Unauthorized");
  }

  return {
    user: {
      email: user.email,
      admin: user.admin,
      organizations: user.organizations,
    },
  };
}

const buildDownloadFilename = (traceId: string) => `trace-${traceId}.json`;

export default withMiddlewares({
  GET: async (req, res) => {
    const session = getTraceExportSession(
      await getServerAuthSession({ req, res }),
    );

    const result = querySchema.safeParse({
      traceId: req.query.traceId,
      projectId: req.query.projectId,
    });

    if (!result.success) {
      throw new InvalidRequestError(result.error.message);
    }

    const payload = await buildTraceExport({
      ...result.data,
      session,
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const downloadFilename = buildDownloadFilename(result.data.traceId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trace-export.json"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
    );

    // Use the shared stringify helper (not the raw JSON.stringify) so that
    // \uXXXX escapes in string fields (e.g. Japanese ingested with Python
    // ensure_ascii=True) are decoded to real characters. Pass indent=2 to keep
    // the download human-readable, matching the previous pretty-printed output.
    return res.status(200).send(stringify(payload, undefined, 2));
  },
});
