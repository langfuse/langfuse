import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type GatewayInvitationEmailAudience =
  | { kind: "invitee"; hasAccount: boolean }
  | { kind: "member" };

type GatewayInvitationEmailTemplateProps = {
  audience: GatewayInvitationEmailAudience;
  inviterName: string;
  inviterEmail: string;
  orgName: string;
  receiverEmail: string;
  /** Greets the receiver by name when known. */
  receiverName?: string;
  link: string;
  emailFromAddress: string;
  langfuseCloudRegion?: string;
};

export const GatewayInvitationEmailTemplate = ({
  audience,
  inviterName,
  inviterEmail,
  orgName,
  receiverEmail,
  receiverName,
  link,
  emailFromAddress,
  langfuseCloudRegion,
}: GatewayInvitationEmailTemplateProps) => {
  const isInvitee = audience.kind === "invitee";
  const previewText = isInvitee
    ? `${inviterName} invited you to the AI Gateway`
    : `${inviterName} set up the AI Gateway for ${orgName}`;
  const regionSuffix = langfuseCloudRegion
    ? ` (${langfuseCloudRegion} data region)`
    : "";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-background font-sans">
          {/* Stay on the same 465px card as the other invites. Long links wrap inside it so the card cannot grow and get clipped. */}
          <Container className="mx-auto my-10 w-[465px] max-w-[465px] table-fixed rounded border border-solid border-[#eaeaea] p-5 [overflow-wrap:anywhere]">
            <Section className="mt-8">
              <Img
                src="https://static.langfuse.com/langfuse_logo_transactional_email.png"
                width="40"
                height="26"
                alt="Langfuse"
                className="mx-auto my-0 h-[26px] w-[40px] max-w-full"
              />
            </Section>
            <Heading className="mx-0 my-[30px] p-0 text-center text-2xl font-normal text-black">
              The <strong>AI Gateway</strong> is ready in{" "}
              <strong>{orgName}</strong>
            </Heading>
            <Text className="text-sm leading-6 text-black">
              {receiverName ? `Hello ${receiverName},` : "Hello,"}
            </Text>
            <Text className="text-sm leading-6 text-black">
              <strong>{inviterName}</strong> (
              <span className="text-blue-600 no-underline">{inviterEmail}</span>
              ){" "}
              {isInvitee
                ? "invited you to use the AI Gateway in the "
                : "set up the AI Gateway for the "}
              <strong>{orgName}</strong> organization on Langfuse
              {regionSuffix}.
            </Text>
            <Text className="text-sm leading-6 text-black">
              One key for every model your team enabled. Create a gateway key
              and call any of them through a single endpoint, with no provider
              keys to collect or manage.
            </Text>
            <Section className="mb-4 mt-8 text-center">
              {/* Note: link always refers to a root langfuse url and is not vulnerable to hyperlink injection attacks */}
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={link}
              >
                {isInvitee ? "Accept invitation" : "Create a gateway key"}
              </Button>
              {isInvitee ? (
                <Text className="mt-2 text-xs leading-3 text-muted-foreground">
                  {audience.hasAccount
                    ? "(sign in with your existing account)"
                    : "(you need to create an account with this email address)"}
                </Text>
              ) : null}
            </Section>
            <Text className="text-sm leading-6 text-black">
              or copy and paste this URL into your browser:{" "}
              <span className="break-all text-blue-600 no-underline">
                {link}
              </span>
            </Text>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This email was intended for{" "}
              <span className="text-black">{receiverEmail}</span>. It was sent
              from <span className="text-black">{emailFromAddress}</span>. If
              you were not expecting it, you can ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
