import { slackifyMarkdown } from "slackify-markdown";

import { escapeSlackMrkdwn, type SlackMessage } from "./SlackService";
import { buildSlackLinkSection } from "./buildSlackLinkSection";

/**
 * buildColoredAttachmentSlackMessage renders a color-barred Slack Block Kit
 * message (title, markdown body, timestamp, optional deep links). Shared
 * layout for monitor alerts and project notifications so both look identical;
 * callers own their severity→color mapping.
 */
export function buildColoredAttachmentSlackMessage(args: {
  color: string;
  title: string;
  body: string;
  timestamp: Date;
  url?: string;
  /** contextText is an optional extra context element rendered next to the timestamp. */
  contextText?: string;
  /**
   * secondaryUrl, when set alongside `url`, renders a second link after
   * "View in Langfuse" (e.g. a monitor alert's link to the breaching data).
   * Absent by default so project notifications stay single-link.
   */
  secondaryUrl?: string;
  /** secondaryLabel is the second link's label; defaults to "View data". */
  secondaryLabel?: string;
}): SlackMessage {
  const { color } = args;
  const title = escapeSlackMrkdwn(args.title);
  const titleText = args.url ? `*<${args.url}|${title}>*` : `*${title}*`;
  const blocks: any[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: titleText },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: slackifyMarkdown(args.body) },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `⏱ ${args.timestamp.toISOString()}`,
        },
        ...(args.contextText
          ? [
              {
                type: "mrkdwn",
                text: escapeSlackMrkdwn(args.contextText),
              },
            ]
          : []),
      ],
    },
    ...(args.url
      ? [
          buildSlackLinkSection([
            { label: "View in Langfuse", url: args.url },
            ...(args.secondaryUrl
              ? [
                  {
                    label: args.secondaryLabel ?? "View data",
                    url: args.secondaryUrl,
                  },
                ]
              : []),
          ]),
        ]
      : []),
  ];
  // Color bar renders only on attachment-nested blocks; top-level text/blocks would duplicate above it.
  return {
    blocks: [],
    attachments: [{ color, fallback: args.title, blocks }],
  };
}
