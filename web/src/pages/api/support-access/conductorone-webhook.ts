import { conductorOneWebhookHandler } from "@/src/ee/features/support-access/server/conductorOneWebhook";

export default conductorOneWebhookHandler;

export const config = {
  api: {
    bodyParser: false,
  },
};
