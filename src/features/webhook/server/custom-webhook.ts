import { env } from "@/src/env.mjs";

const webhook = async (message: unknown) => {
  if (!env.CUSTOM_WEBHOOK) throw new Error("CUSTOM_WEBHOOK is not set");

  return await fetch(env.CUSTOM_WEBHOOK, {
    method: "POST",
    body: JSON.stringify({
      text: JSON.stringify(message),
      content: JSON.stringify(message),
    }),
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export default webhook;
