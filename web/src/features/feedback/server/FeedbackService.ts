import { randomUUID } from "node:crypto";
import { env } from "@/src/env.mjs";
import type {
  PostFeedbackBodyType,
  PostFeedbackResponseType,
} from "@/src/features/public-api/types/feedback";

type FeedbackAuthScope = {
  projectId: string;
  orgId: string;
};

type SlackTextObject = {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
};

type SlackBlock =
  | {
      type: "header";
      text: SlackTextObject;
    }
  | {
      type: "section";
      text: SlackTextObject;
    }
  | {
      type: "section";
      fields: SlackTextObject[];
    }
  | {
      type: "divider";
    };

type SlackPayload = {
  text: string;
  blocks: SlackBlock[];
  unfurl_links: false;
  unfurl_media: false;
};

export type FeedbackSlackMessage = SlackPayload;

export class FeedbackSinkUnavailableError extends Error {
  public readonly name = "ServiceUnavailableError";
  public readonly httpCode = 503;
  public readonly isOperational = true;

  public isUserError(): boolean {
    return false;
  }
}

const SLACK_SECTION_TEXT_LIMIT = 3000;
const SLACK_FIELD_TEXT_LIMIT = 2000;

const truncateForSlack = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 14))}\n[truncated]`;
};

const plainText = (value: string, maxLength: number): SlackTextObject => ({
  type: "plain_text",
  text: truncateForSlack(value, maxLength),
  emoji: false,
});

const mrkdwnText = (value: string): SlackTextObject => ({
  type: "mrkdwn",
  text: value,
});

const appendPlainTextSection = (
  blocks: SlackBlock[],
  label: string,
  value: string | undefined,
) => {
  if (!value) return;

  blocks.push(
    {
      type: "section",
      text: mrkdwnText(`*${label}*`),
    },
    {
      type: "section",
      text: plainText(value, SLACK_SECTION_TEXT_LIMIT),
    },
  );
};

const getDataRegion = (): string =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "self-hosted";

export const buildFeedbackSlackMessage = ({
  id,
  input,
  authScope,
}: {
  id: string;
  input: PostFeedbackBodyType;
  authScope: FeedbackAuthScope;
}): FeedbackSlackMessage => {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Langfuse Feedback",
        emoji: false,
      },
    },
    {
      type: "section",
      fields: [
        plainText(`Feedback ID\n${id}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Target type\n${input.targetType}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Target\n${input.target}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Data region\n${getDataRegion()}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Project ID\n${authScope.projectId}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Org ID\n${authScope.orgId}`, SLACK_FIELD_TEXT_LIMIT),
      ],
    },
  ];

  appendPlainTextSection(blocks, "Feedback", input.feedback);
  appendPlainTextSection(blocks, "Goal / use case", input.goal);
  appendPlainTextSection(blocks, "Reference URL", input.referenceUrl);

  return {
    text: `New Langfuse feedback ${id}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
};

const getFeedbackWebhookUrl = (): string => {
  const webhookUrl = env.LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK;

  if (!webhookUrl) {
    throw new FeedbackSinkUnavailableError(
      "Feedback Slack sink is not configured",
    );
  }

  const parsed = new URL(webhookUrl);
  if (
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    (parsed.protocol !== "https:" || parsed.hostname !== "hooks.slack.com")
  ) {
    throw new FeedbackSinkUnavailableError(
      "Feedback Slack sink is misconfigured",
    );
  }

  return webhookUrl;
};

export const submitFeedback = async ({
  input,
  authScope,
}: {
  input: PostFeedbackBodyType;
  authScope: FeedbackAuthScope;
}): Promise<PostFeedbackResponseType> => {
  const id = randomUUID();
  const webhookUrl = getFeedbackWebhookUrl();
  const payload = buildFeedbackSlackMessage({ id, input, authScope });

  const response = await fetch(webhookUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new FeedbackSinkUnavailableError(
      "Feedback Slack sink rejected message",
    );
  }

  return { id };
};
