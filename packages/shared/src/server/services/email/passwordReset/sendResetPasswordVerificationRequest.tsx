/*
 * To be used in the `sendVerificationRequest` function of the `email` provider of NextAuth.js.
 */

import * as React from "react";
import {
  Body,
  Button,
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
  url: string;
}

const ResetPasswordTemplate = ({ url }: ResetPasswordTemplateProps) => {
  const previewText = "Reset your Langfuse password";
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
              Forgot your Langfuse password?
              <br />
              It happens to the best of us.
            </Heading>
            <Section className="mb-8 mt-8 text-center">
              <Button
                className="rounded bg-black px-5 py-3 text-center text-xs font-semibold text-white no-underline"
                href={url}
              >
                Reset your password
              </Button>
            </Section>
            <Text className="text-center text-xs leading-6 text-[#666666]">
              If you do not want to change your password or didn&apos;t request
              a reset, you can ignore and delete this email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export async function sendResetPasswordVerificationRequest(
  params: SendVerificationRequestParams
) {
  const { identifier, url, provider } = params;
  const transport = createTransport(provider.server);
  const htmlTemplate = render(<ResetPasswordTemplate url={url} />);
  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: `Forgot your password?`,
    text: `To reset your Langfuse password, please confirm your email:\n${url}\n\nIf you do not want to change your password or didn't request a reset, you can ignore and delete this email.`,
    html: htmlTemplate,
  });
  const failed = result.rejected.concat(result.pending).filter(Boolean);
  if (failed.length) {
    throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
  }
}

export default ResetPasswordTemplate;
