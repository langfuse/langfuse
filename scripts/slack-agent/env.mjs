export function readConfig(source = process.env) {
  const required = (name) => {
    const value = source[name]?.trim();
    if (!value || value.includes("replace-me"))
      throw new Error(`Set ${name} in scripts/slack-agent/.env.local first.`);
    return value;
  };
  const mode = source.SLACK_AGENT_MODE?.trim() || "shared";
  if (mode !== "shared" && mode !== "linked")
    throw new Error("SLACK_AGENT_MODE must be shared or linked.");
  const config = {
    mode,
    botToken: required("SLACK_BOT_TOKEN"),
    appToken: required("SLACK_APP_TOKEN"),
    teamId: required("SLACK_TEAM_ID"),
    ...(mode === "shared" ? { channelId: required("SLACK_CHANNEL_ID") } : {}),
    baseUrl: required("LANGFUSE_BASE_URL"),
    ...(mode === "linked"
      ? { serviceSecret: required("LANGFUSE_SLACK_AGENT_SECRET") }
      : {
          publicKey: required("LANGFUSE_PUBLIC_KEY"),
          secretKey: required("LANGFUSE_SECRET_KEY"),
        }),
  };
  if (
    !config.botToken.startsWith("xoxb-") ||
    !config.appToken.startsWith("xapp-")
  ) {
    throw new Error(
      "Slack needs a bot token (xoxb-) and a Socket Mode app token (xapp-).",
    );
  }
  if (
    !/^T[A-Z0-9]+$/.test(config.teamId) ||
    (mode === "shared" && !/^[CG][A-Z0-9]+$/.test(config.channelId))
  ) {
    throw new Error(
      "Use Slack IDs for SLACK_TEAM_ID (T…) and SLACK_CHANNEL_ID (C… or G…), not names.",
    );
  }
  return config;
}
