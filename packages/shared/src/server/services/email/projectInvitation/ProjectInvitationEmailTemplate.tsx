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
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface ProjectInvitationTemplateProps {
  invitedByUsername: string;
  invitedByUserEmail: string;
  projectName: string;
  recieverEmail: string;
  inviteLink: string;
  emailFromAddress: string;
  langfuseCloudRegion?: string;
}

export const ProjectInvitationTemplate = ({
  invitedByUsername,
  invitedByUserEmail,
  projectName,
  recieverEmail,
  inviteLink,
  emailFromAddress,
  langfuseCloudRegion,
}: ProjectInvitationTemplateProps) => {
  const previewText = `Join ${invitedByUsername} on Langfuse`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
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
              Join <strong>{projectName}</strong> on <strong>Langfuse</strong>
            </Heading>
            <Text className="text-sm leading-6 text-black">Hello,</Text>
            <Text className="text-sm leading-6 text-black">
              <strong>{invitedByUsername}</strong> (
              <Link
                href={`mailto:${invitedByUserEmail}`}
                className="text-blue-600 no-underline"
              >
                {invitedByUserEmail}
              </Link>
              ) has invited you to the <strong>{projectName}</strong> project on
              {langfuseCloudRegion
                ? ` Langfuse (${langfuseCloudRegion} data region)`
                : " Langfuse"}
              .
            </Text>
            <Section className="mb-4 mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={inviteLink}
              >
                Accept Invitation
              </Button>
              <Text className="mt-2 text-xs leading-3 text-muted-foreground">
                (you need to create an account)
              </Text>
            </Section>
            <Text className="text-sm leading-6 text-black">
              or copy and paste this URL into your browser:{" "}
              <Link href={inviteLink} className="text-blue-600 no-underline">
                {inviteLink}
              </Link>
            </Text>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This invitation was intended for{" "}
              <span className="text-black">{recieverEmail}</span>. This invite
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

export default ProjectInvitationTemplate;
