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
import { EvaluatorBlockReason } from "@prisma/client";

type EvaluatorBlockedEmailTemplateProps = {
  projectName: string;
  evaluatorName: string;
  blockReason: EvaluatorBlockReason;
  blockMessage: string;
  resolutionUrl: string;
  receiverEmail: string;
};

const getReasonSummary = (blockReason: EvaluatorBlockReason) => {
  switch (blockReason) {
    case EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID:
      return "LLM authentication failed";
    case EvaluatorBlockReason.LLM_CONNECTION_MISSING:
      return "LLM connection missing";
    case EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING:
      return "Default evaluation model missing";
    case EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE:
      return "Configured model unavailable";
    case EvaluatorBlockReason.PROVIDER_ACCOUNT_NOT_READY:
      return "Provider account setup incomplete";
    case EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID:
    default:
      return "Evaluation model configuration invalid";
  }
};

const getResolutionSteps = (blockReason: EvaluatorBlockReason) => {
  switch (blockReason) {
    case EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID:
      return (
        <>
          • Check the LLM connection credentials in Project Settings → LLM
          Connections
          <br />
          • Save the corrected connection
          <br />• Reactivate the paused evaluator
        </>
      );
    case EvaluatorBlockReason.LLM_CONNECTION_MISSING:
      return (
        <>
          • Add or restore the missing LLM connection in Project Settings → LLM
          Connections
          <br />
          • Confirm the evaluator still points to the expected provider
          <br />• Reactivate the paused evaluator
        </>
      );
    case EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING:
      return (
        <>
          • Configure a default evaluation model in Project Settings
          <br />
          • Or edit the evaluator template to use an explicit provider/model
          <br />• Reactivate the paused evaluator
        </>
      );
    case EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE:
      return (
        <>
          • The configured model may have been deleted or renamed
          <br />
          • Update the evaluator template or default evaluation model
          <br />• Reactivate the paused evaluator
        </>
      );
    case EvaluatorBlockReason.PROVIDER_ACCOUNT_NOT_READY:
      return (
        <>
          • Complete the provider account setup required to use this model
          <br />
          • Retry the evaluator configuration once the provider is ready
          <br />• Reactivate the paused evaluator
        </>
      );
    case EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID:
    default:
      return (
        <>
          • Review the evaluator configuration and error details
          <br />
          • Update the evaluator template or default evaluation model
          <br />• Reactivate the paused evaluator
        </>
      );
  }
};

export const EvaluatorBlockedEmailTemplate = ({
  projectName,
  evaluatorName,
  blockReason,
  blockMessage,
  resolutionUrl,
  receiverEmail,
}: EvaluatorBlockedEmailTemplateProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        LLM evaluator &quot;{evaluatorName}&quot; in project &quot;
        {projectName}&quot; paused: {getReasonSummary(blockReason)}
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
                The LLM evaluator &quot;{evaluatorName}&quot; in project &quot;
                {projectName}&quot; was automatically paused because{" "}
                {getReasonSummary(blockReason).toLowerCase()}.
              </Text>
            </Section>

            <Section className="mt-8">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <Text className="text-amber-800 text-sm font-medium m-0 mb-1">
                  Reason
                </Text>
                <Text className="text-amber-900 text-sm m-0">
                  {blockMessage}
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
                How to resolve
              </Heading>
              <Text className="text-gray-700 text-sm leading-6">
                {getResolutionSteps(blockReason)}
              </Text>
            </Section>

            <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />

            <Section>
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This notification was sent to {receiverEmail} regarding the
                paused evaluator &quot;{evaluatorName}&quot; in project &quot;
                {projectName}&quot;.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default EvaluatorBlockedEmailTemplate;
