import type { WebhookInput } from "@langfuse/shared/src/server";

export type TeamsAdaptiveCardPayload = {
  type: "message";
  attachments: Array<{
    contentType: string;
    content: object;
  }>;
};

export function buildTeamsAdaptiveCard(
  input: WebhookInput,
): TeamsAdaptiveCardPayload {
  const p = input.payload;
  const title = `Langfuse: Prompt ${p.prompt.name} ${p.action}`;
  const facts: Array<{ title: string; value: string }> = [
    { title: "Prompt", value: p.prompt.name },
    { title: "Version", value: String(p.prompt.version) },
    { title: "Action", value: p.action },
  ];

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: title,
              weight: "Bolder",
              size: "Large",
            },
            {
              type: "FactSet",
              facts,
            },
          ],
        },
      },
    ],
  };
}
