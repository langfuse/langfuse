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
  let title: string;
  let facts: Array<{ title: string; value: string }>;

  if (input.payload.type === "metric-alert") {
    const p = input.payload;
    title = `Langfuse Alert: ${p.metric}`;
    facts = [
      { title: "Metric", value: p.metric },
      { title: "Value", value: String(p.value) },
      { title: "Threshold", value: `${p.operator} ${p.threshold}` },
      { title: "Window", value: `${p.lookbackWindowMinutes}m` },
      { title: "Triggered At", value: p.triggeredAt },
    ];
  } else {
    const p = input.payload;
    title = `Langfuse: Prompt ${p.prompt.name} ${p.action}`;
    facts = [
      { title: "Prompt", value: p.prompt.name },
      { title: "Version", value: String(p.prompt.version) },
      { title: "Action", value: p.action },
    ];
  }

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
