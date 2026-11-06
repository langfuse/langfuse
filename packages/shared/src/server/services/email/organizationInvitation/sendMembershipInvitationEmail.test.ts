import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendMembershipInvitationEmail } from "./sendMembershipInvitationEmail";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nodemailer")>();
  return { ...actual, createTransport: () => ({ sendMail }) };
});

vi.mock("../../../logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const baseParams = {
  to: "invitee@example.com",
  inviterName: "Inviter",
  inviterEmail: "inviter@example.com",
  orgName: "Acme",
  orgId: "org-1",
  userExists: true,
};

const env = (nextAuthUrl: string) => ({
  EMAIL_FROM_ADDRESS: "noreply@langfuse.com",
  SMTP_CONNECTION_URL: "smtp://user:pass@localhost:25",
  NEXTAUTH_URL: nextAuthUrl,
});

describe("sendMembershipInvitationEmail", () => {
  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
  });

  // Vercel deployments set NEXTAUTH_URL from VERCEL_URL, which has no scheme.
  it("still sends the invite when the base URL has no scheme", async () => {
    await sendMembershipInvitationEmail({
      ...baseParams,
      env: env("my-app.vercel.app"),
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].html).toContain(
      "my-app.vercel.app/organization/org-1",
    );
  });

  it("omits the role sentence for project-only invites", async () => {
    await sendMembershipInvitationEmail({
      ...baseParams,
      orgRole: "NONE",
      env: env("https://langfuse.example.com"),
    });

    const html = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain("None");
    expect(html).not.toContain("with the");
  });
});
