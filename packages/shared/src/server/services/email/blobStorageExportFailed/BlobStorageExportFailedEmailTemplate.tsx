import React from "react";
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

type BlobStorageExportFailedEmailTemplateProps = {
  projectName: string;
  settingsUrl: string;
};

export const BlobStorageExportFailedEmailTemplate = ({
  projectName,
  settingsUrl,
}: BlobStorageExportFailedEmailTemplateProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        Blob storage export failed for project &quot;{projectName}&quot;
      </Preview>
      <Tailwind>
        <Body className="bg-background my-auto mx-auto font-sans">
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

            <Section>
              <Heading className="mx-0 my-[30px] p-0 text-center text-2xl font-normal text-black">
                Blob Storage Export Failed
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                The scheduled blob storage export for project &quot;
                {projectName}&quot; has failed. Review the integration settings
                to see the error details and resolve the issue.
              </Text>
            </Section>

            <Section className="mt-8 text-center">
              <Button
                className="rounded bg-red-600 px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={settingsUrl}
              >
                Review Settings
              </Button>
            </Section>

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />

            <Section>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This notification was sent to project admins regarding a failed
                blob storage export for project &quot;{projectName}&quot;.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BlobStorageExportFailedEmailTemplate;
