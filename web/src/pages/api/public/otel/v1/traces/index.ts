import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";
import * as root from "./otlp-proto/generated/root";

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
    fn: async ({ req }) => {
      const body: Buffer = await new Promise((resolve, reject) => {
        let data: any[] = [];
        req.on("data", (chunk) => data.push(chunk));
        req.on("end", () => resolve(Buffer.concat(data)));
        req.on("error", reject);
      });

      const parsed = (
        root as any
      ).opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest.decode(
        body,
      );
      logger.info(`Received OTel Trace`, {
        headers: req.headers,
        trace: parsed,
      });
      return {};
    },
  }),
});
