import { env } from "@/src/env.mjs";

export const sendToSlack = async (message: unknown) => {
  if (!env.LANGFUSE_TEAM_SLACK_WEBHOOK)
    throw new Error("LANGFUSE_TEAM_SLACK_WEBHOOK is not set");

  return await fetch(env.LANGFUSE_TEAM_SLACK_WEBHOOK, {
    method: "POST",
    body: JSON.stringify({ rawBody: JSON.stringify(message, null, 2) }),
    headers: {
      "Content-Type": "application/json",
    },
  });
};
