import type { SendVerificationRequestParams } from "next-auth/providers/email";
import { describe, expect, it, vi } from "vitest";
import type { env } from "@/src/env.mjs";

const { sendResetPasswordVerificationRequestMock } = vi.hoisted(() => ({
  sendResetPasswordVerificationRequestMock: vi.fn(),
}));

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const original = await importOriginal<{ env: typeof env }>();
  return {
    env: {
      ...original.env,
      EMAIL_FROM_ADDRESS: "noreply@example.com",
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
    },
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendResetPasswordVerificationRequest:
    sendResetPasswordVerificationRequestMock,
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import { getAuthOptions } from "@/src/server/auth";

describe("authentication email locale", () => {
  it("binds the request locale to the email provider callback", async () => {
    const authOptions = await getAuthOptions({ locale: "zh-CN" });
    const emailProvider = authOptions.providers.find(
      (provider) => typeof provider !== "function" && provider.id === "email",
    );

    if (!emailProvider || typeof emailProvider === "function") {
      throw new Error("Expected the email provider to be configured");
    }

    const params = {
      identifier: "user@example.com",
      token: "123456",
      url: "https://cloud.langfuse.com/auth/setup-password",
      provider: emailProvider,
    } as SendVerificationRequestParams;

    await emailProvider.options?.sendVerificationRequest?.(params);

    expect(sendResetPasswordVerificationRequestMock).toHaveBeenCalledWith(
      params,
      "zh-CN",
    );
  });
});
