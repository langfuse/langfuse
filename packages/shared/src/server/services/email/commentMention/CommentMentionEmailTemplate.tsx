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
  mentionedUserName: string;
  mentionedUserEmail: string;
  authorName?: string; // Optional - undefined if author deleted or not project member
  projectName: string;
  commentPreview: string;
  commentLink: string;
  settingsLink: string;
}

export const CommentMentionEmailTemplate = ({
  mentionedUserName,
  mentionedUserEmail,
  authorName,
  projectName,
  commentPreview,
  commentLink,
  settingsLink,
}: CommentMentionEmailTemplateProps) => {
  const previewText = authorName
    ? `${authorName} mentioned you in ${projectName}`
    : `You were mentioned in a comment in ${projectName}`;

  // Split by newlines and render with line breaks
  const commentLines = commentPreview.split("\n");

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
              {authorName
                ? `${authorName} mentioned you`
                : "You were mentioned in a comment"}
            </Heading>
            <Text className="text-sm leading-6 text-black">
              Hello <strong>{mentionedUserName}</strong>
            </Text>
            <Text className="text-sm leading-6 text-black">
              {authorName ? (
                <>
                  <strong>{authorName}</strong> mentioned you in a comment in{" "}
                  <strong>{projectName}</strong>:
                </>
              ) : (
                <>
                  You were mentioned in a comment in{" "}
                  <strong>{projectName}</strong>:
                </>
              )}
            </Text>
            <Section className="my-6 rounded border border-solid border-[#eaeaea] bg-[#f8f9fa] p-4">
              <Text
                className="m-0 text-sm leading-6 text-[#333333]"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {commentLines.map((line, index) => (
                  <React.Fragment key={index}>
                    {line}
                    {index < commentLines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </Text>
            </Section>
            <Section className="mb-4 mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={commentLink}
              >
                View Comment
              </Button>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This email was sent to{" "}
              <span className="text-black">{mentionedUserEmail}</span>. You can{" "}
              <a
                href={settingsLink}
                className="text-[#666666] underline"
                target="_blank"
              >
                manage your notification preferences
              </a>{" "}
              in your project settings.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default CommentMentionEmailTemplate;
