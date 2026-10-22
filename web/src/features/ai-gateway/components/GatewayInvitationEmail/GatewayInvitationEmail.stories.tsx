import { GatewayInvitationEmailTemplate } from "@langfuse/shared/src/server/services/email/aiGatewayInvitation/GatewayInvitationEmailTemplate";
import { renderToStaticMarkup } from "react-dom/server";

import preview from "@/.storybook/preview";

const gatewayKeysUrl =
  "https://cloud.langfuse.com/organization/org-1/settings/ai-gateway-api-keys";

const meta = preview.meta({
  component: GatewayInvitationEmailTemplate,
  args: {
    inviterName: "Ada Lovelace",
    inviterEmail: "ada@company.com",
    orgName: "Acme",
    receiverEmail: "grace@company.com",
    link: gatewayKeysUrl,
    emailFromAddress: "notifications@langfuse.com",
    langfuseCloudRegion: "EU",
  },
  // Emails render a full <html> document, so they need their own frame.
  render: (args) => (
    <iframe
      title="Email preview"
      srcDoc={renderToStaticMarkup(
        <GatewayInvitationEmailTemplate {...args} />,
      )}
      className="h-[820px] w-full border-0"
    />
  ),
});

export const InviteeWithoutAccount = meta.story({
  args: {
    audience: { kind: "invitee", hasAccount: false },
    link: `https://cloud.langfuse.com/auth/sign-up?targetPath=${encodeURIComponent("/organization/org-1/settings/ai-gateway-api-keys")}&email=${encodeURIComponent("grace@company.com")}`,
  },
});

export const InviteeWithAccount = meta.story({
  args: { audience: { kind: "invitee", hasAccount: true } },
});

export const ExistingMember = meta.story({
  args: { audience: { kind: "member" }, receiverName: "Grace Hopper" },
});
