import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { z } from "zod";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "OTel Metrics",
    querySchema: z.any(),
    responseSchema: z.any(),
    rateLimitResource: "ingestion",
    fn: async () => {},
  }),
});
