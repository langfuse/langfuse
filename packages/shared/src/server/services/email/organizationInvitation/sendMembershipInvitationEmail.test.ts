import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendMembershipInvitationEmail } from "./sendMembershipInvitationEmail";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nodemailer")>();
  return { ...actual, createTransport: () => ({ sendMail }) };
});

async function sentInvitationHtml(params: {
  userExists: boolean;
  ssoEnforced?: boolean;
}) {
  await sendMembershipInvitationEmail({
    env: {
      EMAIL_FROM_ADDRESS: "noreply@langfuse.com",
      SMTP_CONNECTION_URL: "smtp://user:pass@localhost:25",
      NEXTAUTH_URL: "http://localhost:3000",
    },
    to: "jane@acme.com",
    inviterName: "Inviter",
    inviterEmail: "inviter@acme.com",
    orgName: "Acme",
    orgId: "org-1",
    ...params,
  });
  expect(sendMail).toHaveBeenCalledTimes(1);
  return (sendMail.mock.calls[0][0] as { html: string }).html;
}

describe("sendMembershipInvitationEmail", () => {
  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({ rejected: [], pending: [] });
  });

  it.each([
    {
      invitee: "a new user on an SSO-enforced domain",
      params: { userExists: false, ssoEnforced: true },
      link: "http://localhost:3000/auth/sign-in?targetPath=%2Forganization%2Forg-1&amp;email=jane%40acme.com",
      hint: "sign in with your company",
    },
    {
      invitee: "a new user",
      params: { userExists: false },
      link: "http://localhost:3000/auth/sign-up?targetPath=%2Forganization%2Forg-1&amp;email=jane%40acme.com",
      hint: "you need to create an account with this email address",
    },
    {
      invitee: "an existing user",
      params: { userExists: true, ssoEnforced: true },
      link: "http://localhost:3000/organization/org-1",
      hint: "sign in with your existing account",
    },
  ])("links $invitee to the right page", async ({ params, link, hint }) => {
    const html = await sentInvitationHtml(params);

    expect(html).toContain(`href="${link}"`);
    expect(html).toContain(hint);
  });
});
