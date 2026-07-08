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

interface BatchExportSuccessTemplateProps {
  userName: string;
  receiverEmail: string;
  downloadLink: string;
  batchExportName: string;
}

export const BatchExportSuccessEmailTemplate = ({
  receiverEmail,
  downloadLink,
  userName,
  batchExportName,
}: BatchExportSuccessTemplateProps) => {
  const previewText = `Download your data export from Langfuse`;

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
              Your data export is ready
            </Heading>
            <Text className="text-sm leading-6 text-black">
              Hello <strong>{userName}</strong>
            </Text>
            <Text className="text-sm leading-6 text-black">
              Your data export{" "}
              <span className="font-mono">{batchExportName}</span> is ready to
              download. The download link is valid for a few hours.
            </Text>
            <Text className="text-sm leading-6 text-black">
              Please note data exports do not reflect custom column ordering or
              visibility.
            </Text>
            <Section className="mb-4 mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={downloadLink}
              >
                Download Export
              </Button>
            </Section>
            <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
            <Text className="text-xs leading-6 text-[#666666]">
              This email was intended for{" "}
              <span className="text-black">{receiverEmail}</span>. If you were
              not expecting this email, please delete it.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BatchExportSuccessEmailTemplate;
