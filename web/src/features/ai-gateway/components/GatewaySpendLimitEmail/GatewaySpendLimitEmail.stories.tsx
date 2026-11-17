import { GatewaySpendLimitEmailTemplate } from "@langfuse/shared/src/server/services/email/aiGatewaySpendLimit/GatewaySpendLimitEmailTemplate";
import { renderToStaticMarkup } from "react-dom/server";

import preview from "@/.storybook/preview";

const meta = preview.meta({
  component: GatewaySpendLimitEmailTemplate,
  args: {
    orgName: "Acme",
    scope: {
      type: "API_KEY" as const,
      name: "Support bot",
      displaySecretKey: "sk-lf-gw-...91bc",
    },
    interval: "daily",
    limitUsd: 25,
    resetsAt: "Nov 17, 2026, 12:00 AM UTC",
    receiverEmail: "grace@company.com",
    receiverName: "Grace Hopper",
    link: "https://cloud.langfuse.com/organization/org-1/ai-gateway/api-keys",
    emailFromAddress: "notifications@langfuse.com",
  },
  // Emails render a full <html> document, so they need their own frame.
  render: (args) => (
    <iframe
      title="Email preview"
      srcDoc={renderToStaticMarkup(
        <GatewaySpendLimitEmailTemplate {...args} />,
      )}
      className="h-[820px] w-full border-0"
    />
  ),
});

export const KeyOwner = meta.story({
  args: { audience: "keyOwner" },
});

export const OrganizationOwner = meta.story({
  args: { audience: "orgOwner", receiverName: undefined },
});

export const TotalLimit = meta.story({
  args: {
    audience: "keyOwner",
    interval: "total",
    limitUsd: 500,
    resetsAt: undefined,
  },
});
