import { render } from "@react-email/render";
import { createMailTransport } from "../transport";

import { MembershipInvitationTemplate } from "./MembershipInvitationEmailTemplate";
import { logger } from "../../../logger";
import { getEmailAppBaseUrl } from "../getEmailAppBaseUrl";

type SendMembershipInvitationParams = {
  env: Partial<
    Record<
      | "EMAIL_FROM_ADDRESS"
      | "SMTP_CONNECTION_URL"
      | "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"
      | "NEXTAUTH_URL",
      string | undefined
    >
  >;
  to: string;
  inviterName: string;
  inviterEmail: string;
  orgName: string;
  orgId: string;
  userExists: boolean;
  /**
   * The invitee's email domain must authenticate via SSO, so sign-up would
   * reject them. New users are sent to sign-in, which starts the SSO flow.
   */
  ssoEnforced?: boolean;
};

export const sendMembershipInvitationEmail = async ({
  env,
  to,
  inviterName,
  inviterEmail,
  orgName,
  orgId,
  userExists,
  ssoEnforced = false,
}: SendMembershipInvitationParams) => {
  if (!env.EMAIL_FROM_ADDRESS || !env.SMTP_CONNECTION_URL) {
    logger.error(
      "Missing environment variables for sending membership invitation email.",
    );
    return;
  }

  const authUrl = getEmailAppBaseUrl(env);
  if (!authUrl) {
    logger.error(
      "Missing NEXTAUTH_URL or NEXT_PUBLIC_LANGFUSE_CLOUD_REGION environment variable.",
    );
    return;
  }

  const orgPath = `/organization/${orgId}`;
  const authPage = ssoEnforced ? "sign-in" : "sign-up";
  const inviteLink = userExists
    ? `${authUrl}${orgPath}`
    : `${authUrl}/auth/${authPage}?targetPath=${encodeURIComponent(orgPath)}&email=${encodeURIComponent(to)}`;

  try {
    const mailer = createMailTransport(env.SMTP_CONNECTION_URL);

    const htmlTemplate = await render(
      MembershipInvitationTemplate({
        invitedByUsername: inviterName,
        invitedByUserEmail: inviterEmail,
        orgName: orgName,
        receiverEmail: to,
        inviteLink: inviteLink,
        userExists: userExists,
        ssoEnforced: ssoEnforced,
        emailFromAddress: env.EMAIL_FROM_ADDRESS,
        langfuseCloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      }),
    );

    await mailer.sendMail({
      to,
      from: `Langfuse <${env.EMAIL_FROM_ADDRESS}>`,
      subject: `${inviterName} invited you to join the "${orgName}" organization on Langfuse`,
      html: htmlTemplate,
    });
  } catch (error) {
    logger.error(error);
  }
};
