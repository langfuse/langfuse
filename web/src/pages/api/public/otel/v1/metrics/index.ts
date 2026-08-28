import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { writeOtlpHttpResponse } from "@/src/server/otel/otlpResponse";
import { z } from "zod";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "OTel Metrics",
    querySchema: z.any(),
    responseSchema: z.any(),
    rateLimitResource: "ingestion",
    writeResponse: writeOtlpHttpResponse,
    fn: async () => {},
  }),
});
