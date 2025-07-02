import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  type IngestionEventType,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import { OtelIngestionProcessor } from "@/src/features/otel/server/OtelIngestionProcessor";
import { gunzip } from "node:zlib";

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
        return res.status(400).json({ error: "Failed to read request body" });
      }

      if (req.headers["content-encoding"]?.includes("gzip")) {
        try {
          body = await new Promise((resolve, reject) => {
            gunzip(body, (err, result) =>
              err ? reject(err) : resolve(result),
            );
          });
        } catch (e) {
          logger.error(`Failed to decompress request body`, e);
          return res
            .status(400)
            .json({ error: "Failed to decompress request body" });
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
        return res.status(400).json({ error: "Invalid content type" });
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
          return res
            .status(400)
            .json({ error: "Failed to parse OTel Protobuf Trace" });
        }
      }
      if (contentType.includes("application/json")) {
        try {
          resourceSpans = JSON.parse(body.toString()).resourceSpans;
        } catch (e) {
          logger.error(`Failed to parse OTel JSON`, e);
          return res
            .status(400)
            .json({ error: "Failed to parse OTel JSON Trace" });
        }
      }

      // Create and process OTEL resource spans to ingestion events
      const processor = new OtelIngestionProcessor({
        projectId: auth.scope.projectId,
        publicKey: auth.scope.publicKey,
      });
      const events: IngestionEventType[] =
        await processor.processToIngestionEvents(resourceSpans);

      // We set a delay of 0 for OTel, as we never expect updates.
      // We also set the source to "otel" which helps us with metric tracking and skipping list calls for S3.
      return processEventBatch(events, auth, { delay: 0, source: "otel" });
    },
  }),
});
