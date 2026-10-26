import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";
import type { TeamInviteMember } from "@/src/features/ai-gateway/types/teamInviteMembers";
import {
  GatewaySetupGuide,
  type GatewaySetupGuideProps,
} from "./GatewaySetupGuide";

const MEMBER_SUGGESTION_LIMIT = 4;

const organizationMembers = [
  { id: "user-1", name: "Ada Lovelace", email: "ada@company.com", image: null },
  {
    id: "user-2",
    name: "Grace Hopper",
    email: "grace@company.com",
    image: null,
  },
  { id: "user-3", name: null, email: "alan@company.com", image: null },
  {
    id: "user-4",
    name: "Edsger Dijkstra",
    email: "edsger@company.com",
    image: null,
  },
  { id: "user-5", name: "David Kim", email: "david@company.com", image: null },
  {
    id: "user-6",
    name: "Barbara Liskov",
    email: "barbara@company.com",
    image: null,
  },
];

/**
 * Holds the invitee list like the connected page does and answers the member
 * search the way the server does. `organizationMembers` are the organization;
 * every other address counts as someone to invite.
 */
function GatewaySetupGuideWithInvitees(
  props: Omit<
    GatewaySetupGuideProps,
    "invitees" | "inviteeMembers" | "suggestedMembers"
  >,
) {
  const invitees = useTeamInviteEmails();
  const search = invitees.draft.trim().toLowerCase();
  const suggestedMembers = organizationMembers
    .filter(
      (member) =>
        !invitees.emails.includes(member.email) &&
        [member.name, member.email].some((value) =>
          value?.toLowerCase().includes(search),
        ),
    )
    .slice(0, MEMBER_SUGGESTION_LIMIT);
  const membersByEmail = new Map(
    organizationMembers.map((member) => [
      member.email,
      { name: member.name, isSelf: false, canUseGateway: true },
    ]),
  );
  const inviteeMembers = new Map<string, TeamInviteMember | null>(
    invitees.emails.map((email) => [email, membersByEmail.get(email) ?? null]),
  );

  return (
    <GatewaySetupGuide
      {...props}
      suggestedMembers={suggestedMembers}
      invitees={invitees}
      inviteeMembers={inviteeMembers}
    />
  );
}

const meta = preview.meta({ component: GatewaySetupGuideWithInvitees });

const projects = [
  { id: "project-production", name: "Production" },
  { id: "project-gateway", name: "ai-gateway" },
];

const savedConfig = {
  organizationId: "org-1",
  ingestionMode: "USAGE" as const,
  defaultIngestionProjectId: "project-gateway",
  defaultIngestionProject: {
    id: "project-gateway",
    orgId: "org-1",
    deletedAt: null,
  },
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
};

const notifiableMembers = {
  isEmailConfigured: true,
  count: 12,
};

export const ChoosingIngestion = meta.story({
  args: {
    activeStep: 1,
    config: null,
    projects,
    firstConnection: undefined,
    isSavingIngestion: false,
    onSaveIngestion: fn(async () => true),
    onAddCredential: fn(),
    notifiableMembers,
    isInviting: false,
    onInvite: fn(async () => null),
    onFinish: fn(),
  },
});

export const AddingCredential = meta.story({
  args: {
    ...ChoosingIngestion.input.args,
    activeStep: 2,
    config: savedConfig,
  },
});

export const InvitingTeam = meta.story({
  args: {
    ...AddingCredential.input.args,
    activeStep: 3,
    firstConnection: { provider: "OPENAI" },
  },
});

export const InvitingTeamWithoutEmail = meta.story({
  args: {
    ...InvitingTeam.input.args,
    notifiableMembers: { ...notifiableMembers, isEmailConfigured: false },
  },
});

export const TestRetryDoesNotNotifyAgain = meta.story({
  name: "(Test) Retrying failed invites does not notify members again",
  args: {
    ...InvitingTeam.input.args,
    onInvite: fn(async () => ({
      invitedCount: 0,
      existingMemberCount: 0,
      failed: [{ email: "sam@contractor.dev", message: "Invitation failed" }],
      notifiedCount: 12,
    })),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "All existing members (12)" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Email addresses" }),
      "sam@contractor.dev ",
    );
    await expect(
      canvas.getByText(/1 person isn't in the organization yet/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Notify 13 people" }),
    );

    await expect(args.onInvite).toHaveBeenCalledWith({
      emails: ["sam@contractor.dev"],
      notifyMembers: true,
    });
    await expect(
      await canvas.findByText("Some invitations were not sent"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Remove All existing members" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /All existing members/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Notify 1 person" }),
    ).toBeEnabled();
  },
});

export const TestSearchAndRefill = meta.story({
  name: "(Test) Typing searches members and picked members are refilled",
  args: InvitingTeam.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "David Kim" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Ada Lovelace" }));
    await expect(
      canvas.getByRole("button", { name: "David Kim" }),
    ).toBeVisible();

    const input = canvas.getByRole("textbox", { name: "Email addresses" });
    await userEvent.type(input, "lisk");
    await expect(
      canvas.queryByRole("button", { name: /All existing members/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "David Kim" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    await expect(input).toHaveValue("");
    await expect(
      canvas.getByRole("button", { name: "Remove Barbara Liskov" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Notify 2 people" }),
    ).toBeEnabled();
  },
});
