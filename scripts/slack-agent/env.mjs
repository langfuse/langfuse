export function readConfig(source = process.env) {
  const required = (name) => {
    const value = source[name]?.trim();
    if (!value || value.includes("replace-me"))
      throw new Error(
        `Set ${name} in the process environment or scripts/slack-agent/.env.local.`,
      );
    return value;
  };
  const config = {
    botToken: required("SLACK_BOT_TOKEN"),
    appToken: required("SLACK_APP_TOKEN"),
    teamId: required("SLACK_TEAM_ID"),
    channelId: required("SLACK_CHANNEL_ID"),
    baseUrl: required("LANGFUSE_BASE_URL"),
    publicKey: required("LANGFUSE_PUBLIC_KEY"),
    secretKey: required("LANGFUSE_SECRET_KEY"),
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
    !/^[CG][A-Z0-9]+$/.test(config.channelId)
  ) {
    throw new Error(
      "Use Slack IDs for SLACK_TEAM_ID (T…) and SLACK_CHANNEL_ID (C… or G…), not names.",
    );
  }
  return config;
}
