import { runFeedbackCorsMiddleware } from "@/src/features/feedback/server/corsMiddleware";
import { sendToSlack } from "@/src/features/slack/server/slack-webhook";
import { type NextApiRequest, type NextApiResponse } from "next";
import { logger } from "@langfuse/shared/src/server";

// Collects feedack from users that do not use the cloud version of the app
export default async function feedbackApiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runFeedbackCorsMiddleware(req, res);

  try {
    const slackResponse = await sendToSlack(req.body);
    if (slackResponse.status === 200) {
      res.status(200).json({ status: "OK" });
    } else {
      logger.error(slackResponse);
      res.status(400).json({ status: "Error" });
    }
  } catch (error) {
    logger.error(error);
    res.status(500).json({ status: "Error" });
  }
}
