import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  type IngestionEventType,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import { $root } from "@/src/pages/api/public/otel/otlp-proto/generated/root";
import { convertOtelSpanToIngestionEvent } from "@/src/features/otel/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "OTel Traces",
    querySchema: z.any(),
    responseSchema: z.any(),
    rateLimitResource: "ingestion",
    successStatusCode: 207,
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

      let resourceSpans: any;
      switch (req.headers["content-type"]?.toLowerCase()) {
        case "application/x-protobuf": {
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
          break;
        }
        case "application/json": {
          try {
            resourceSpans = JSON.parse(body.toString()).resourceSpans;
          } catch (e) {
            logger.error(`Failed to parse OTel JSON`, e);
            return res
              .status(400)
              .json({ error: "Failed to parse OTel JSON Trace" });
          }
          break;
        }
        default:
          return res.status(400).json({ error: "Unsupported content type" });
      }

      const events: IngestionEventType[] = resourceSpans.flatMap(
        convertOtelSpanToIngestionEvent,
      );
      // We set a delay of 0 for OTel, as we never expect updates.
      return processEventBatch(events, auth, 0);
    },
  }),
});
