import { env } from "@/src/env.mjs";

export const sendToBetterstack = async (message: unknown) => {
  if (!env.LANGFUSE_TEAM_BETTERSTACK_TOKEN) return;

  const url = "https://in.logs.betterstack.com";

  const headers = new Headers({
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.LANGFUSE_TEAM_BETTERSTACK_TOKEN}`,
  });

  const payload = {
    dt: new Date().toISOString(), // Gets the current date in ISO format (UTC)
    message: JSON.stringify(message, null, 2),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
};
