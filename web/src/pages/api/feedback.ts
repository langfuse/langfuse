import feedbackApiHandler from "@/src/features/feedback/server/feedbackHandler";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";

export default withMiddlewares({ POST: feedbackApiHandler });

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
};
