import { env } from "@/src/env.mjs";

const webhook = async (type: string, message: unknown) => {
  if (!env.CUSTOM_WEBHOOK) throw new Error("CUSTOM_WEBHOOK is not set");

  return await fetch(env.CUSTOM_WEBHOOK, {
    method: "POST",
    body: JSON.stringify({
      text: "New " + type + " created " + JSON.stringify(message),
      content: "New " + type + " created " + JSON.stringify(message),
    }),
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export default webhook;
