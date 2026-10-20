import { escapeSlackMrkdwn } from "./SlackService";

/**
 * buildSlackLinkSection renders deep links as an mrkdwn section. Slack sends an
 * interaction payload for URL buttons and shows an error unless the app
 * acknowledges it, so links are plain mrkdwn instead of buttons.
 */
export function buildSlackLinkSection(links: { label: string; url: string }[]) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: links
        .map(({ label, url }) => `🔗 *<${url}|${escapeSlackMrkdwn(label)}>*`)
        .join("    "),
    },
  };
}
