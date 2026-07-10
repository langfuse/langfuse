import docsMcpFeedbackHandler from "@/src/features/feedback/server/docsMcpFeedbackHandler";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";

export default withMiddlewares({ POST: docsMcpFeedbackHandler });

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
};
