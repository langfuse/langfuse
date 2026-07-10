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
    rateLimitResource: "feedback",
    redactLogBody: (body) => {
      const candidate =
        typeof body === "object" && body !== null
          ? (body as {
              targetType?: unknown;
              target?: unknown;
            })
          : {};
      return {
        targetType: candidate.targetType,
        target: candidate.target,
      };
    },
    fn: async ({ body, auth, req }) =>
      await submitFeedback({
        input: body,
        context: auth.scope,
        source:
          req.headers["x-langfuse-client"] === "cli"
            ? "langfuse-cli"
            : "public-api",
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
