import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import { z } from "zod";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "OTel Metrics",
    action: "traces:create",
    querySchema: z.any(),
    responseSchema: z.any(),
    rateLimitResource: "ingestion",
    fn: async () => {},
  }),
});
