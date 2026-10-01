import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  getWebhookRun,
  startWebhookRun,
} from "@/src/features/in-app-agent/server/webhook";

export default withMiddlewares({ POST: startWebhookRun, GET: getWebhookRun });

export const config = {
  api: { bodyParser: { sizeLimit: "256kb" } },
};
