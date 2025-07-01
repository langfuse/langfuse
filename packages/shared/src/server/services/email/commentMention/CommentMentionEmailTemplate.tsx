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

interface CommentMentionEmailTemplateProps {
  mentionedByName: string;
  mentionedByEmail: string;
  commentContent: string;
  objectType: string;
  objectId: string;
  projectName: string;
  orgName: string;
  objectLink: string;
  receiverEmail: string;
  emailFromAddress: string;
  langfuseCloudRegion?: string;
}

export const CommentMentionEmailTemplate = ({
  mentionedByName,
  mentionedByEmail,
  commentContent,
  objectType,
  objectId,
  projectName,
  orgName,
  objectLink,
  receiverEmail,
  emailFromAddress,
  langfuseCloudRegion,
}: CommentMentionEmailTemplateProps) => {
  const previewText = `${mentionedByName} mentioned you in a comment on ${projectName}`;

  // Truncate comment content for email display
  const truncatedContent = commentContent.length > 200 
    ? commentContent.substring(0, 200) + "..." 
    : commentContent;

  // Format object type for display
  const formatObjectType = (type: string) => {
    switch (type.toLowerCase()) {
      case "trace":
        return "Trace";
      case "observation":
        return "Observation";
      case "session":
        return "Session";
      case "prompt":
        return "Prompt";
      default:
        return type;
    }
  };

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
              You were mentioned in a comment
            </Heading>
            <Text className="text-sm leading-6 text-black">Hello,</Text>
            <Text className="text-sm leading-6 text-black">
              <strong>{mentionedByName}</strong> (
              <span className="text-blue-600 no-underline">
                {mentionedByEmail}
              </span>
              ) mentioned you in a comment on a {formatObjectType(objectType)} in{" "}
              <strong>{projectName}</strong>
              {langfuseCloudRegion
                ? ` on Langfuse (${langfuseCloudRegion} data region)`
                : " on Langfuse"}
              .
            </Text>
            
            <Section className="my-6 rounded bg-gray-50 p-4">
              <Text className="text-sm text-gray-600 mb-2">
                <strong>Comment:</strong>
              </Text>
              <Text className="text-sm leading-6 text-black whitespace-pre-wrap">
                {truncatedContent}
              </Text>
            </Section>

            <Text className="text-sm leading-6 text-black">
              <strong>Object Details:</strong>
            </Text>
            <Text className="text-sm leading-6 text-gray-600">
              Type: {formatObjectType(objectType)}
              <br />
              ID: {objectId}
              <br />
              Project: {projectName}
              <br />
              Organization: {orgName}
            </Text>

            <Section className="mb-4 mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={objectLink}
              >
                View Comment
              </Button>
            </Section>
            
            <Text className="text-sm leading-6 text-black">
              or copy and paste this URL into your browser:{" "}
              <span className="text-blue-600 no-underline">{objectLink}</span>
            </Text>
            
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This notification was sent to{" "}
              <span className="text-black">{receiverEmail}</span> because you were mentioned in a comment. This email was sent from{" "}
              <span className="text-black">{emailFromAddress}</span>. If you were not expecting this notification, you can ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default CommentMentionEmailTemplate;