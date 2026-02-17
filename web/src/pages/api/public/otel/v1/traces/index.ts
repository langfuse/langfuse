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

// Helper to send response with correct Content-Type per OTLP/HTTP spec
// See: https://opentelemetry.io/docs/specs/otlp/#otlphttp-response
function sendOtlpResponse(
  res: import("next").NextApiResponse,
  contentType: string,
  statusCode: number,
  jsonResponse: object,
) {
  res.status(statusCode);
  if (contentType.includes("application/x-protobuf")) {
    // Per OTLP spec: response must use same Content-Type as request
    res.setHeader("Content-Type", "application/x-protobuf");
    // Encode empty ExportTraceServiceResponse (no partialSuccess = full success)
    const protoResponse =
      $root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse.encode(
        {},
      ).finish();
    res.send(Buffer.from(protoResponse));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.json(jsonResponse);
  }
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
      const contentType = req.headers["content-type"]?.toLowerCase() ?? "";
      const isProtobuf = contentType.includes("application/x-protobuf");

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
        sendOtlpResponse(res, contentType, 400, {
          error: "Failed to read request body",
        });
        return;
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
          sendOtlpResponse(res, contentType, 400, {
            error: "Failed to decompress request body",
          });
          return;
        }
      }

      let resourceSpans: any;
      // Strict content-type matching does not work if something like `content-type: text/javascript; charset=utf-8` is sent.
      if (
        !contentType ||
        (!contentType.includes("application/json") && !isProtobuf)
      ) {
        logger.error(`Invalid content type: ${contentType}`);
        sendOtlpResponse(res, contentType, 400, {
          error: "Invalid content type",
        });
        return;
      }
      if (isProtobuf) {
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
          sendOtlpResponse(res, contentType, 400, {
            error: "Failed to parse OTel Protobuf Trace",
          });
          return;
        }
      }
      if (contentType.includes("application/json")) {
        try {
          resourceSpans = JSON.parse(body.toString()).resourceSpans;
        } catch (e) {
          logger.error(`Failed to parse OTel JSON`, e);
          sendOtlpResponse(res, contentType, 400, {
            error: "Failed to parse OTel JSON Trace",
          });
          return;
        }
      }

      if (!resourceSpans || resourceSpans.length === 0) {
        // Per OTLP spec: respond with same Content-Type as request
        sendOtlpResponse(res, contentType, 200, {});
        return;
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
      });

      // At this point, we have the raw OpenTelemetry Span body. We upload the full batch to S3
      // and the OtelIngestionProcessor logic will handle processing in the worker container.
      const result = await processor.publishToOtelIngestionQueue(resourceSpans);

      // Per OTLP/HTTP spec: response must use same Content-Type as request
      // See: https://opentelemetry.io/docs/specs/otlp/#otlphttp-response
      sendOtlpResponse(res, contentType, 200, result);
      return;
    },
  }),
});
