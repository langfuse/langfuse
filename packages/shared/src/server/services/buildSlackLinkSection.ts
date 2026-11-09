import { escapeSlackMrkdwn } from "./SlackService";

/** Slack rejects the whole message when a section's text exceeds this. */
const SLACK_SECTION_TEXT_MAX_LENGTH = 3000;

/**
 * buildSlackLinkSection renders deep links as an mrkdwn section. Slack sends an
 * interaction payload for URL buttons and shows an error unless the app
 * acknowledges it, so links are plain mrkdwn instead of buttons. Links that
 * would push the text over Slack's limit are dropped so the message still sends.
 */
export function buildSlackLinkSection(links: { label: string; url: string }[]) {
  let text = "";
  for (const { label, url } of links) {
    const link = `:arrow_right: *<${url}|${escapeSlackMrkdwn(label)}>*`;
    const next = text ? `${text}    ${link}` : link;
    if (next.length <= SLACK_SECTION_TEXT_MAX_LENGTH) text = next;
  }
  return { type: "section", text: { type: "mrkdwn", text } };
}
