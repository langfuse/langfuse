import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { submitFeedback } from "@/src/app/support/feedback/server";
import {
  PostFeedbackBody,
  PostFeedbackResponse,
} from "@/src/public-api/types/feedback";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Submit Feedback",
    action: "feedback:create",
    bodySchema: PostFeedbackBody,
    responseSchema: PostFeedbackResponse,
    successStatusCode: 201,
    fn: async ({ body, auth }) =>
      await submitFeedback({
        input: body,
        scope: auth.scope,
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
