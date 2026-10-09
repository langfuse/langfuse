import { LangfuseNotFoundError } from "@langfuse/shared";
import { addUserToSpan, stringify } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import {
  authorizeExportDownload,
  buildExportDownload,
  downloadFilename,
  readDownloadToken,
} from "@/src/features/mcp/server/observations/export-download";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";

export default withMiddlewares({
  GET: async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
      throw new LangfuseNotFoundError("MCP observation downloads are disabled");
    }
    const claims = readDownloadToken(req.query.token);
    const scope = await authorizeExportDownload(claims);
    addUserToSpan({
      projectId: claims.projectId,
      orgId: scope.orgId,
      apiKeyId: claims.apiKeyId,
    });
    const rateLimit = await RateLimitService.getInstance().rateLimitRequest(
      scope,
      "public-api",
    );
    if (rateLimit?.isRateLimited()) {
      return rateLimit.sendRestResponseIfLimited(res);
    }
    const payload = await buildExportDownload(claims, scope.plan);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trace-export.json"; filename*=UTF-8''${encodeURIComponent(downloadFilename(claims))}`,
    );
    res.status(200).send(stringify(payload, undefined, 2));
  },
});
