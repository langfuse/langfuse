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
  Section,
  Text,
  Tailwind,
  Preview,
} from "@react-email/components";

interface EvalPausedEmailTemplateProps {
  templateName: string;
  pauseReason: string;
  pauseReasonCode: string;
  resolutionUrl: string;
  receiverEmail: string;
}

export const EvalPausedEmailTemplate = ({
  templateName,
  pauseReason,
  pauseReasonCode,
  resolutionUrl,
  receiverEmail,
}: EvalPausedEmailTemplateProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        LLM evaluator &quot;{templateName}&quot; paused: {pauseReason}
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
                ⚠️ Evaluator Paused
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                The LLM evaluator &quot;{templateName}&quot; was automatically
                paused due to an unrecoverable error:{" "}
                {pauseReasonCode === "LLM_401"
                  ? "LLM authentication failed (401)"
                  : pauseReasonCode === "LLM_404"
                    ? "Model not found (404)"
                    : "an error occurred"}
                .
              </Text>
            </Section>

            <Section className="mt-8">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <Text className="text-amber-800 text-sm font-medium m-0 mb-1">
                  Reason
                </Text>
                <Text className="text-amber-900 text-sm m-0">
                  {pauseReason}
                </Text>
              </div>
            </Section>

            <Section className="mt-8 text-center">
              <Button
                className="rounded bg-amber-600 px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={resolutionUrl}
              >
                Fix Evaluator Configuration
              </Button>
            </Section>

            <Section className="mt-8">
              <Heading className="text-black text-[18px] font-semibold">
                How to resolve:
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                {pauseReasonCode === "LLM_401" ? (
                  <>
                    • Check your LLM connections in Project Settings → LLM
                    Connections
                    <br />
                    • Save the corrected LLM connection after updating the
                    credentials
                    <br />• Reactivate evaluators that were set to INACTIVE
                  </>
                ) : pauseReasonCode === "LLM_404" ? (
                  <>
                    • The configured model may have been deleted or renamed
                    <br />
                    • Edit the evaluator template and select a valid model
                    <br />
                    • Or update the default evaluation model in Project Settings
                    <br />• Reactivate evaluators that were set to INACTIVE
                  </>
                ) : (
                  <>
                    • Review the error details above
                    <br />
                    • Edit the evaluator template and fix the configuration
                    <br />• Reactivate evaluators that were set to INACTIVE
                  </>
                )}
              </Text>
            </Section>

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />

            <Section>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This notification was sent to {receiverEmail} regarding the
                paused evaluator &quot;{templateName}&quot;.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default EvalPausedEmailTemplate;
