import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { submitFeedback } from "@/src/features/feedback/server/FeedbackService";
import {
  PostFeedbackBody,
  PostFeedbackResponse,
} from "@/src/features/public-api/types/feedback";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Submit Feedback",
    bodySchema: PostFeedbackBody,
    responseSchema: PostFeedbackResponse,
    successStatusCode: 201,
    skipRateLimit: true,
    redactLogBody: (body) => {
      const candidate =
        typeof body === "object" && body !== null
          ? (body as {
              targetType?: unknown;
            })
          : {};
      return {
        targetType: candidate.targetType,
      };
    },
    fn: async ({ body, auth }) =>
      await submitFeedback({
        input: body,
        context: auth.scope,
        source: "public-api",
      }),
  }),
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
};
