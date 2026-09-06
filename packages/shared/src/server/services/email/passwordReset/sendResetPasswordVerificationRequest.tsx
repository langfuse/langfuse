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
import { render } from "@react-email/render";
import { type SendVerificationRequestParams } from "next-auth/providers/email";
import { createMailTransport } from "../transport";

interface ResetPasswordTemplateProps {
  token: string;
  isSetupMode: boolean;
  locale: AuthEmailLocale;
}

type AuthEmailLocale = "en" | "zh-CN";

const authEmailCopy = {
  en: {
    setup: {
      preview: "Verify your Langfuse email",
      subject: "Verify your Langfuse email",
      heading: ["Welcome to Langfuse!", "Verify your email to get started."],
      expiration:
        "This code is valid for 3 minutes. If you did not request this, you can ignore this email.",
      text: (token: string) =>
        `Welcome to Langfuse! Use the following code to verify your email: ${token}\n\nThis code will expire in 3 minutes. If you did not request this, you can ignore this email.`,
    },
    reset: {
      preview: "Your Langfuse reset code",
      subject: "Your Langfuse password reset code",
      heading: [
        "Forgot your Langfuse password?",
        "It happens to the best of us.",
      ],
      expiration:
        "This code is valid for 3 minutes. If you did not request a reset, you can ignore this email.",
      text: (token: string) =>
        `Use the following code to reset your Langfuse password: ${token}\n\nThis code will expire in 3 minutes. If you did not request a reset, you can ignore this email.`,
    },
    passcodeLabel: "Your one time passcode:",
  },
  "zh-CN": {
    setup: {
      preview: "验证您的 Langfuse 邮箱",
      subject: "验证您的 Langfuse 邮箱",
      heading: ["欢迎使用 Langfuse！", "验证邮箱即可开始使用。"],
      expiration:
        "此验证码将在 3 分钟后失效。如果这不是您发起的操作，可以忽略此邮件。",
      text: (token: string) =>
        `欢迎使用 Langfuse！请使用以下验证码验证您的邮箱：${token}\n\n此验证码将在 3 分钟后失效。如果这不是您发起的操作，可以忽略此邮件。`,
    },
    reset: {
      preview: "您的 Langfuse 重置验证码",
      subject: "您的 Langfuse 密码重置验证码",
      heading: ["忘记了 Langfuse 密码？", "这种情况很常见。"],
      expiration:
        "此验证码将在 3 分钟后失效。如果您没有请求重置密码，可以忽略此邮件。",
      text: (token: string) =>
        `请使用以下验证码重置您的 Langfuse 密码：${token}\n\n此验证码将在 3 分钟后失效。如果您没有请求重置密码，可以忽略此邮件。`,
    },
    passcodeLabel: "您的一次性验证码：",
  },
} as const;

const ResetPasswordTemplate = ({
  token,
  isSetupMode,
  locale,
}: ResetPasswordTemplateProps) => {
  const copy = authEmailCopy[locale];
  const flowCopy = isSetupMode ? copy.setup : copy.reset;

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{flowCopy.preview}</Preview>
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
              {flowCopy.heading[0]}
              <br />
              {flowCopy.heading[1]}
            </Heading>
            <Section className="mb-8 mt-8 text-center">
              <Text className="text-center text-sm font-semibold">
                {copy.passcodeLabel}
              </Text>
              <Heading className="text-3xl mt-2">{token}</Heading>
            </Section>
            <Text className="text-center text-xs leading-6 text-[#666666]">
              {flowCopy.expiration}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

const SETUP_PASSWORD_PATH = "/auth/setup-password";

/*
 * NextAuth only hands this function the verification URL, which carries the
 * sign-in `callbackUrl` percent-encoded in its query string. That destination
 * is therefore the only signal for which flow asked for the code, and it
 * selects the email copy only — never an authorization decision.
 */
function isSetupPasswordFlow(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const callbackUrl = new URL(url).searchParams.get("callbackUrl");
    if (!callbackUrl) return false;
    // Relative callback URLs need a base to parse; the origin is irrelevant here.
    const { pathname } = new URL(callbackUrl, "http://localhost");
    return pathname.replace(/\/+$/, "").endsWith(SETUP_PASSWORD_PATH);
  } catch {
    return false;
  }
}

export async function sendResetPasswordVerificationRequest(
  params: SendVerificationRequestParams,
  locale: AuthEmailLocale = "en",
) {
  const { identifier, token, provider, url } =
    params as SendVerificationRequestParams & { token: string };
  const transport = createMailTransport(provider.server as string);

  const isSetupMode = isSetupPasswordFlow(url);

  const htmlTemplate = await render(
    <ResetPasswordTemplate
      token={token}
      isSetupMode={isSetupMode}
      locale={locale}
    />,
  );

  const copy = authEmailCopy[locale];
  const flowCopy = isSetupMode ? copy.setup : copy.reset;

  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: flowCopy.subject,
    text: flowCopy.text(token),
    html: htmlTemplate,
  });
  // nodemailer's SES transport omits `rejected`/`pending` from SentMessageInfo,
  // so guard against undefined before reading them.
  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(
    Boolean,
  );
  if (failed.length) {
    throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
  }
}

export default ResetPasswordTemplate;
