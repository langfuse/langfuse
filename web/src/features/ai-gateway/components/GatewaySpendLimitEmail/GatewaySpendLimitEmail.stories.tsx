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
    limits: [
      {
        interval: "daily",
        limitUsd: 25,
        resetsAt: "Nov 17, 2026, 12:00 AM UTC",
      },
    ],
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
    limits: [{ interval: "total", limitUsd: 500 }],
  },
});

export const SeveralLimits = meta.story({
  args: {
    audience: "orgOwner",
    limits: [
      {
        interval: "daily",
        limitUsd: 25,
        resetsAt: "Nov 17, 2026, 12:00 AM UTC",
      },
      {
        interval: "monthly",
        limitUsd: 400,
        resetsAt: "Dec 1, 2026, 12:00 AM UTC",
      },
      { interval: "total", limitUsd: 1000 },
    ],
  },
});

export const UserLimit = meta.story({
  args: {
    audience: "orgOwner",
    scope: {
      type: "USER" as const,
      name: "Grace Hopper",
      email: "grace@company.com",
    },
    link: "https://cloud.langfuse.com/organization/org-1/ai-gateway/budgets",
  },
});

export const WarningThreshold = meta.story({
  args: {
    audience: "keyOwner",
    limits: [
      {
        interval: "monthly",
        limitUsd: 100,
        thresholdPercent: 85,
        resetsAt: "Dec 1, 2026, 12:00 AM UTC",
      },
    ],
  },
});

export const OrganizationWarning = meta.story({
  args: {
    audience: "orgOwner",
    scope: { type: "ORGANIZATION" as const },
    limits: [
      {
        interval: "monthly",
        limitUsd: 500,
        thresholdPercent: 95,
        resetsAt: "Dec 1, 2026, 12:00 AM UTC",
      },
    ],
    link: "https://cloud.langfuse.com/organization/org-1/ai-gateway/budgets",
  },
});

export const MixedWarningAndExceeded = meta.story({
  args: {
    audience: "orgOwner",
    limits: [
      {
        interval: "daily",
        limitUsd: 25,
        thresholdPercent: 100,
        resetsAt: "Nov 17, 2026, 12:00 AM UTC",
      },
      {
        interval: "monthly",
        limitUsd: 400,
        thresholdPercent: 85,
        resetsAt: "Dec 1, 2026, 12:00 AM UTC",
      },
    ],
  },
});
