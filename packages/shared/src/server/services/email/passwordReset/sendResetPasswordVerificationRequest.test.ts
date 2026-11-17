import { type SendVerificationRequestParams } from "next-auth/providers/email";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendResetPasswordVerificationRequest } from "./sendResetPasswordVerificationRequest";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nodemailer")>();
  return { ...actual, createTransport: () => ({ sendMail }) };
});

const TOKEN = "123456";
const IDENTIFIER = "user@example.com";

// Mirrors how NextAuth's email provider builds the verification URL: the
// caller's `callbackUrl` is percent-encoded into the query string.
function verificationRequestParams(
  callbackUrl: string,
  minutesValid = 3,
  from = "noreply@langfuse.com",
): SendVerificationRequestParams {
  const params = new URLSearchParams({
    callbackUrl,
    token: TOKEN,
    email: IDENTIFIER,
  });
  return {
    identifier: IDENTIFIER,
    token: TOKEN,
    expires: new Date(Date.now() + minutesValid * 60 * 1000),
    url: `http://localhost:3000/api/auth/callback/email?${params}`,
    provider: {
      id: "email",
      type: "email",
      from,
      server: "smtp://user:pass@localhost:25",
    },
    theme: {},
  } as unknown as SendVerificationRequestParams;
}

async function sentMail(callbackUrl: string, minutesValid?: number) {
  await sendResetPasswordVerificationRequest(
    verificationRequestParams(callbackUrl, minutesValid),
  );
  expect(sendMail).toHaveBeenCalledTimes(1);
  return sendMail.mock.calls[0][0] as {
    subject: string;
    text: string;
    html: string;
  };
}

describe("sendResetPasswordVerificationRequest", () => {
  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({ rejected: [], pending: [] });
  });

  it("sends email verification copy for the sign-up flow", async () => {
    const mail = await sentMail(
      "http://localhost:3000/auth/setup-password",
      10,
    );

    expect(mail.subject).toBe("Verify your Langfuse email");
    expect(mail.text).toContain("verify your email");
    expect(mail.text).toContain("This code will expire in 10 minutes.");
    expect(mail.text).not.toContain("reset your Langfuse password");
    expect(mail.html).toContain("Welcome to Langfuse!");
  });

  it("sends email verification copy when the deployment uses a base path", async () => {
    const mail = await sentMail(
      "http://localhost:3000/langfuse/auth/setup-password",
    );

    expect(mail.subject).toBe("Verify your Langfuse email");
  });

  it.each([
    {
      configured: "noreply@example.com",
      header: "Langfuse <noreply@example.com>",
    },
    {
      configured: "Acme <noreply@example.com>",
      header: "Acme <noreply@example.com>",
    },
  ])(
    "sends the code from $header when EMAIL_FROM_ADDRESS is $configured",
    async ({ configured, header }) => {
      await sendResetPasswordVerificationRequest(
        verificationRequestParams(
          "http://localhost:3000/auth/reset-password",
          3,
          configured,
        ),
      );
      // render the message nodemailer would put on the wire
      const { createTransport } =
        await vi.importActual<typeof import("nodemailer")>("nodemailer");
      const rendered = await createTransport({
        streamTransport: true,
        buffer: true,
      }).sendMail(sendMail.mock.calls[0][0]);

      expect(rendered.message.toString().split("\r\n")).toContain(
        `From: ${header}`,
      );
      expect(rendered.envelope.from).toBe("noreply@example.com");
    },
  );

  it("sends password reset copy for the reset flow", async () => {
    const mail = await sentMail("http://localhost:3000/auth/reset-password");

    expect(mail.subject).toBe("Your Langfuse password reset code");
    expect(mail.text).toContain("reset your Langfuse password");
    expect(mail.html).toContain("Forgot your Langfuse password?");
  });

  it("falls back to password reset copy when no callback URL is present", async () => {
    await sendResetPasswordVerificationRequest({
      ...verificationRequestParams("http://localhost:3000/auth/reset-password"),
      url: "http://localhost:3000/api/auth/callback/email",
    });

    expect(sendMail.mock.calls[0][0].subject).toBe(
      "Your Langfuse password reset code",
    );
  });
});
