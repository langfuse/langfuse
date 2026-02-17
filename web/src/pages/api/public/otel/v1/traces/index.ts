import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  logger,
  OtelIngestionProcessor,
  markProjectAsOtelUser,
} from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import { gunzip } from "node:zlib";
import { ForbiddenError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

/** Read a Langfuse header that may arrive with hyphens or underscores. */
function getLangfuseHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const hyphenVal = headers[name];
  if (typeof hyphenVal === "string") return hyphenVal;
  const underscoreVal = headers[name.replaceAll("-", "_")];
  if (typeof underscoreVal === "string") return underscoreVal;
  return undefined;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "OTel Traces",
    querySchema: z.any(),
    responseSchema: z.any(),
    rateLimitResource: "ingestion",
    fn: async ({ req, res, auth }) => {
      // Check if ingestion is suspended due to usage threshold
      if (auth.scope.isIngestionSuspended) {
        throw new ForbiddenError(
          "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
        );
      }

      // Mark project as using OTEL API
      await markProjectAsOtelUser(auth.scope.projectId);

      let body: Buffer;
      try {
        body = await new Promise((resolve, reject) => {
          let data: any[] = [];
          req.on("data", (chunk) => data.push(chunk));
          req.on("end", () => resolve(Buffer.concat(data)));
          req.on("error", reject);
        });
      } catch (e) {
        logger.error(`Failed to read request body`, e);
        res.status(400);
        return { error: "Failed to read request body" };
      }

      if (req.headers["content-encoding"]?.includes("gzip")) {
        try {
          body = await new Promise((resolve, reject) => {
            gunzip(new Uint8Array(body), (err, result) =>
              err ? reject(err) : resolve(result),
            );
          });
        } catch (e) {
          logger.error(`Failed to decompress request body`, e);
          res.status(400);
          return { error: "Failed to decompress request body" };
        }
      }

      let resourceSpans: any;
      const contentType = req.headers["content-type"]?.toLowerCase();
      // Strict content-type matching does not work if something like `content-type: text/javascript; charset=utf-8` is sent.
      if (
        !contentType ||
        (!contentType.includes("application/json") &&
          !contentType.includes("application/x-protobuf"))
      ) {
        logger.error(`Invalid content type: ${contentType}`);
        res.status(400);
        return { error: "Invalid content type" };
      }
      if (contentType.includes("application/x-protobuf")) {
        try {
          const parsed =
            $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.decode(
              body,
            );
          resourceSpans =
            $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.toObject(
              parsed,
            ).resourceSpans;
        } catch (e) {
          logger.error(`Failed to parse OTel Protobuf`, e);
          res.status(400);
          return { error: "Failed to parse OTel Protobuf Trace" };
        }
      }
      if (contentType.includes("application/json")) {
        try {
          resourceSpans = JSON.parse(body.toString()).resourceSpans;
        } catch (e) {
          logger.error(`Failed to parse OTel JSON`, e);
          res.status(400);
          return { error: "Failed to parse OTel JSON Trace" };
        }
      }

      if (!resourceSpans || resourceSpans.length === 0) {
        return {};
      }

      // Extract SDK headers for write path decision (supports both hyphen and underscore formats)
      const sdkName = getLangfuseHeader(req.headers, "x-langfuse-sdk-name");
      const sdkVersion = getLangfuseHeader(
        req.headers,
        "x-langfuse-sdk-version",
      );
      const ingestionVersion = getLangfuseHeader(
        req.headers,
        "x-langfuse-ingestion-version",
      );

      // Reject unsupported future ingestion versions (> 4)
      // Lower versions are valid but use dual write (path A)
      const parsedIngestionVersion = ingestionVersion
        ? parseInt(ingestionVersion, 10)
        : undefined;
      if (
        parsedIngestionVersion !== undefined &&
        (isNaN(parsedIngestionVersion) || parsedIngestionVersion > 4)
      ) {
        res.status(400);
        return {
          error: `Unsupported x-langfuse-ingestion-version: "${ingestionVersion}". Maximum supported: "4".`,
        };
      }

      // Extract headers to propagate for ingestion masking
      const propagatedHeaderNames =
        env.LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS;
      const propagatedHeaders: Record<string, string> = {};
      for (const headerName of propagatedHeaderNames) {
        const value = req.headers[headerName];
        if (typeof value === "string") {
          propagatedHeaders[headerName] = value;
        }
      }

      const processor = new OtelIngestionProcessor({
        projectId: auth.scope.projectId,
        publicKey: auth.scope.publicKey,
        orgId: auth.scope.orgId,
        propagatedHeaders:
          Object.keys(propagatedHeaders).length > 0
            ? propagatedHeaders
            : undefined,
        sdkName,
        sdkVersion,
        ingestionVersion,
      });

      // At this point, we have the raw OpenTelemetry Span body. We upload the full batch to S3
      // and the OtelIngestionProcessor logic will handle processing in the worker container.
      return processor.publishToOtelIngestionQueue(resourceSpans);
    },
  }),
});
