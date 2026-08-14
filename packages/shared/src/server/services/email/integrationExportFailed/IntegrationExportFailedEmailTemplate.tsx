import React, { type ReactNode } from "react";
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

export type IntegrationExportFailedEmailCopy = {
  /** Sentence-initial, for the subject and preview: "Blob storage export failed for …". */
  subjectLabel: string;
  /** Title Case, for the email heading: "Blob Storage Export Disabled". */
  headingLabel: string;
  /** Mid-sentence, for body prose and log lines: "The scheduled blob storage export …". */
  inlineLabel: string;
  /** Shown when the export was turned off; the remediation is integration specific. */
  disabledBody: (projectName: string) => ReactNode;
};

type IntegrationExportFailedEmailTemplateProps = {
  copy: IntegrationExportFailedEmailCopy;
  projectName: string;
  settingsUrl: string;
  disabled?: boolean;
};

export const IntegrationExportFailedEmailTemplate = ({
  copy,
  projectName,
  settingsUrl,
  disabled = false,
}: IntegrationExportFailedEmailTemplateProps) => {
  const preview = disabled
    ? `${copy.subjectLabel} export disabled for project "${projectName}"`
    : `${copy.subjectLabel} export failed for project "${projectName}"`;
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
                  ? `${copy.headingLabel} Export Disabled`
                  : `${copy.headingLabel} Export Failed`}
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                {disabled ? (
                  copy.disabledBody(projectName)
                ) : (
                  <>
                    The scheduled {copy.inlineLabel} export for project &quot;
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
                {disabled ? "disabled" : "failed"} {copy.inlineLabel} export for
                project &quot;{projectName}&quot;.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
