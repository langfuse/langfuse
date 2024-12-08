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

interface NewMemberNotificationTemplateProps {
  invitedByUsername: string;
  invitedByUserEmail: string;
  orgName: string;
  receiverEmail: string;
  inviteLink: string;
  emailFromAddress: string;
  langfuseCloudRegion?: string;
}

export const NewMembershipNotificationTemplate = ({
  invitedByUsername,
  invitedByUserEmail,
  orgName,
  inviteLink,
  receiverEmail,
  emailFromAddress,
  langfuseCloudRegion,
}: NewMemberNotificationTemplateProps) => {
  const previewText = `A new member has joined ${orgName} on Langfuse`;

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
              New member joined <strong>{orgName}</strong>
            </Heading>
            <Text className="text-sm leading-6 text-black">Hello,</Text>
            <Text className="text-sm leading-6 text-black">
              A new member with the email <strong>{invitedByUserEmail}</strong>{" "}
              has joined the <strong>{orgName}</strong> organization, invited by{" "}
              <strong>{invitedByUsername}</strong>.
              {langfuseCloudRegion && (
                <span>
                  {" "}
                  This organization is hosted in the{" "}
                  <strong>{langfuseCloudRegion}</strong> region.
                </span>
              )}
            </Text>
            <Section className="mb-4 mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={inviteLink}
              >
                View Members
              </Button>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This notification was sent to{" "}
              <span className="text-black">{receiverEmail}</span> from{" "}
              <span className="text-black">{emailFromAddress}</span>. If you are
              not responsible for this organization, please ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default NewMembershipNotificationTemplate;
