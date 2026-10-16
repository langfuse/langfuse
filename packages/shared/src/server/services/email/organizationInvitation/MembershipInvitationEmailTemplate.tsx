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
  Link,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface MembershipInvitationTemplateProps {
  invitedByUsername: string;
  invitedByUserEmail: string;
  orgName: string;
  orgRole?: string;
  receiverEmail: string;
  inviteLink: string;
  userExists: boolean;
  emailFromAddress: string;
  langfuseCloudRegion?: string;
}

export const MembershipInvitationTemplate = ({
  invitedByUsername,
  invitedByUserEmail,
  orgName,
  orgRole,
  receiverEmail,
  inviteLink,
  userExists,
  emailFromAddress,
  langfuseCloudRegion,
}: MembershipInvitationTemplateProps) => {
  const inviteHost = new URL(inviteLink).host;

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="mx-auto my-auto bg-background font-sans">
          <Container className="mx-auto my-10 w-[465px] rounded border border-solid border-[#eaeaea] p-5">
            <Section className="mt-8">
              <Img
                src="https://static.langfuse.com/langfuse_logo_transactional_email.png"
                width="40"
                height="40"
                alt="Langfuse"
                className="mx-auto my-0"
              />
            </Section>
            <Heading className="mx-0 my-[30px] p-0 text-center text-2xl font-normal text-black">
              Join <strong>{orgName}</strong> on <strong>Langfuse</strong>
            </Heading>
            <Text className="text-sm leading-6 text-black">Hello,</Text>
            <Text className="text-sm leading-6 text-black">
              <strong>{invitedByUsername}</strong> (
              <span className="text-blue-600 no-underline">
                {invitedByUserEmail}
              </span>
              ) has invited you to join the <strong>{orgName}</strong>{" "}
              organization on
              {langfuseCloudRegion
                ? ` Langfuse (${langfuseCloudRegion} data region)`
                : " Langfuse"}
              {orgRole ? (
                <>
                  {" "}
                  with the <strong>{formatRole(orgRole)}</strong> role
                </>
              ) : null}
              .
            </Text>
            <Text className="text-sm leading-6 text-black">
              Langfuse is an open-source LLM engineering platform for tracing,
              evaluating, and debugging AI applications.
            </Text>
            <Section className="mb-4 mt-8 text-center">
              {/* Note: inviteLink always refers to a root langfuse url and is not vulnerable to hyperlink injection attacks */}
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={inviteLink}
              >
                View invitation on {inviteHost}
              </Button>
            </Section>
            <Text className="text-sm leading-6 text-black">
              {userExists
                ? `The link opens the organization on ${inviteHost}, where you already have a Langfuse account.`
                : `The link opens ${inviteHost}, where you can create a Langfuse account for ${receiverEmail}.`}
            </Text>
            <Text className="break-all text-sm leading-6 text-black">
              Link:{" "}
              <Link href={inviteLink} className="text-blue-600 no-underline">
                {inviteLink}
              </Link>
            </Text>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This invitation was intended for{" "}
              <span className="text-black">{receiverEmail}</span>. This invite
              was sent from{" "}
              <span className="text-black">{emailFromAddress}</span>. If you
              were not expecting this invitation, you can ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

const formatRole = (role: string) =>
  role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
