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
  // When true, the export was turned off after repeated failures and the
  // customer must fix their config and re-enable it — not a transient failure.
  disabled?: boolean;
};

export const BlobStorageExportFailedEmailTemplate = ({
  projectName,
  settingsUrl,
  disabled = false,
}: BlobStorageExportFailedEmailTemplateProps) => {
  const preview = disabled
    ? `Blob storage export disabled for project "${projectName}"`
    : `Blob storage export failed for project "${projectName}"`;
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
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
                {disabled
                  ? "Blob Storage Export Disabled"
                  : "Blob Storage Export Failed"}
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                {disabled ? (
                  <>
                    The blob storage export for project &quot;{projectName}
                    &quot; has been disabled after repeated failures. This
                    usually means the destination configuration or credentials
                    are no longer valid. Once you have updated them, simply
                    re-enable the export in the integration settings and it will
                    pick up right where it left off.
                  </>
                ) : (
                  <>
                    The scheduled blob storage export for project &quot;
                    {projectName}&quot; has failed after multiple attempts. It
                    will be retried automatically at the next scheduled export.
                    If the issue persists, review the integration settings to
                    see the error details.
                  </>
                )}
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
                This notification was sent to project admins regarding a{" "}
                {disabled ? "disabled" : "failed"} blob storage export for
                project &quot;{projectName}&quot;.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default BlobStorageExportFailedEmailTemplate;
