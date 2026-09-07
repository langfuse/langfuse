import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  logger,
  markProjectAsOtelUser,
  createIngestionAttribution,
  getLangfuseHeaderValue,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import { ForbiddenError } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import {
  gunzipOtelRequestBody,
  handleOtelRequestBodyTooLarge,
  OtelRequestBodyTooLargeError,
  readOtelRequestBody,
} from "@/src/server/otel/otelRequestBody";
import { processOtelIngestion } from "@/src/server/otel/processOtelIngestion";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "OTel Traces",
    action: "traces:create",
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

      const maxBodyBytes = env.LANGFUSE_OTEL_INGESTION_MAX_BODY_BYTES;

      let body: Buffer;
      let encodedBodyBytes: number;
      let bodyFailureMessage = "Failed to read request body";
      try {
        body = await readOtelRequestBody(req, maxBodyBytes);
        encodedBodyBytes = body.byteLength;

        if (req.headers["content-encoding"]?.includes("gzip")) {
          bodyFailureMessage = "Failed to decompress request body";
          body = await gunzipOtelRequestBody(body, maxBodyBytes);
        }
      } catch (error) {
        if (error instanceof OtelRequestBodyTooLargeError) {
          return handleOtelRequestBodyTooLarge(
            error,
            req,
            res,
            auth.scope.projectId,
          );
        }

        logger.error(bodyFailureMessage, error);
        res.status(400);
        return { error: bodyFailureMessage };
      }

      const contentType = req.headers["content-type"]?.toLowerCase();

      // Extract SDK headers for write path decision (supports both hyphen and underscore formats)
      const attribution = createIngestionAttribution({
        headers: req.headers,
        authCheck: auth,
      });
      const ingestionVersion = getLangfuseHeaderValue(
        req.headers,
        "x-langfuse-ingestion-version",
      );

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

      const result = await processOtelIngestion({
        body,
        contentType,
        encodedBodyBytes,
        config: {
          projectId: auth.scope.projectId,
          publicKey: auth.scope.publicKey,
          orgId: auth.scope.orgId,
          propagatedHeaders:
            Object.keys(propagatedHeaders).length > 0
              ? propagatedHeaders
              : undefined,
          sdkName: attribution.ingestionSdkName,
          sdkVersion: attribution.ingestionSdkVersion,
          rejectionSdkName: req.headers["x-langfuse-sdk-name"],
          ingestionVersion,
        },
      });
      if (result.kind === "http") {
        res.status(result.status);
        return result.body;
      }

      return result.body ?? {};
    },
  }),
});
