/*
 * To be used in the `sendVerificationRequest` function of the `email` provider of NextAuth.js.
 */

import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { createTransport } from "nodemailer";
import { render } from "@react-email/render";
import { type SendVerificationRequestParams } from "next-auth/providers/email";

interface ResetPasswordTemplateProps {
  token: string;
  isSetupMode: boolean;
}

const ResetPasswordTemplate = ({
  token,
  isSetupMode,
}: ResetPasswordTemplateProps) => {
  const previewText = isSetupMode
    ? "Verify your Langfuse email"
    : "Your Langfuse reset code";
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
            <Heading className="mx-0 my-[30px] p-0 text-center text-xl font-normal text-black">
              {isSetupMode ? (
                <>
                  Welcome to Langfuse!
                  <br />
                  Verify your email to get started.
                </>
              ) : (
                <>
                  Forgot your Langfuse password?
                  <br />
                  It happens to the best of us.
                </>
              )}
            </Heading>
            <Section className="mb-8 mt-8 text-center">
              <Text className="text-center text-sm font-semibold">
                Your one time passcode:
              </Text>
              <Heading className="text-3xl mt-2">{token}</Heading>
            </Section>
            <Text className="text-center text-xs leading-6 text-[#666666]">
              This code is valid for 3 minutes. If you did not request{" "}
              {isSetupMode ? "this" : "a reset"}, you can ignore this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export async function sendResetPasswordVerificationRequest(
  params: SendVerificationRequestParams,
) {
  const { identifier, token, provider, url } =
    params as SendVerificationRequestParams & { token: string };
  const transport = createTransport(provider.server);

  // Detect if this is a setup-password flow (signup email verification)
  const isSetupMode = url?.includes("/auth/setup-password") ?? false;

  const htmlTemplate = await render(
    <ResetPasswordTemplate token={token} isSetupMode={isSetupMode} />,
  );

  const subject = isSetupMode
    ? "Verify your Langfuse email"
    : "Your Langfuse password reset code";

  const textBody = isSetupMode
    ? `Welcome to Langfuse! Use the following code to verify your email: ${token}\n\nThis code will expire in 3 minutes. If you did not request this, you can ignore this email.`
    : `Use the following code to reset your Langfuse password: ${token}\n\nThis code will expire in 3 minutes. If you did not request a reset, you can ignore this email.`;

  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject,
    text: textBody,
    html: htmlTemplate,
  });
  const failed = result.rejected.concat(result.pending).filter(Boolean);
  if (failed.length) {
    throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
  }
}

export default ResetPasswordTemplate;
