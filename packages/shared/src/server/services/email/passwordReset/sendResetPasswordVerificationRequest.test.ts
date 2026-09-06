import type { SendVerificationRequestParams } from "next-auth/providers/email";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SentMail = {
  html: string;
  subject: string;
  text: string;
};

const { sendMailMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(async (_mail: SentMail) => ({
    rejected: [],
    pending: [],
  })),
}));

vi.mock("../transport", () => ({
  createMailTransport: vi.fn(() => ({ sendMail: sendMailMock })),
}));

import { sendResetPasswordVerificationRequest } from "./sendResetPasswordVerificationRequest";

const getParams = (isSetupMode: boolean) =>
  ({
    identifier: "user@example.com",
    token: "123456",
    url: isSetupMode
      ? "https://cloud.langfuse.com/auth/setup-password"
      : "https://cloud.langfuse.com/auth/reset-password",
    provider: {
      server: "smtp://localhost:1025",
      from: "Langfuse <noreply@example.com>",
    },
  }) as SendVerificationRequestParams;

describe("sendResetPasswordVerificationRequest", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("sends a Simplified Chinese signup verification email", async () => {
    await sendResetPasswordVerificationRequest(getParams(true), "zh-CN");

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "验证您的 Langfuse 邮箱",
        text: expect.stringContaining("请使用以下验证码验证您的邮箱：123456"),
        html: expect.stringContaining("验证邮箱即可开始使用。"),
      }),
    );
    expect(sendMailMock.mock.calls[0]?.[0].html).toContain('lang="zh-CN"');
  });

  it("sends a Simplified Chinese password reset email", async () => {
    await sendResetPasswordVerificationRequest(getParams(false), "zh-CN");

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "您的 Langfuse 密码重置验证码",
        text: expect.stringContaining(
          "请使用以下验证码重置您的 Langfuse 密码：123456",
        ),
        html: expect.stringContaining("忘记了 Langfuse 密码？"),
      }),
    );
    expect(sendMailMock.mock.calls[0]?.[0].html).toContain('lang="zh-CN"');
  });

  it("keeps English as the default for existing callers", async () => {
    await sendResetPasswordVerificationRequest(getParams(true));

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Verify your Langfuse email",
        text: expect.stringContaining(
          "Use the following code to verify your email: 123456",
        ),
        html: expect.stringContaining("Verify your email to get started."),
      }),
    );
    expect(sendMailMock.mock.calls[0]?.[0].html).toContain('lang="en"');
  });
});
