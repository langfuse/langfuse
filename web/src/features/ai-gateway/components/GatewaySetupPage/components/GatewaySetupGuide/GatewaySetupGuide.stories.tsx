import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewaySetupGuide } from "./GatewaySetupGuide";

const meta = preview.meta({ component: GatewaySetupGuide });

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
  preview: [
    {
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@company.com",
      image: null,
    },
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
  ],
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
      failed: [{ email: "grace@company.com", message: "Already a member" }],
      notifiedCount: 12,
    })),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Email addresses" }),
      "grace@company.com ",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Send 1 invite" }),
    );

    await expect(args.onInvite).toHaveBeenCalledWith({
      emails: ["grace@company.com"],
      notifyMembers: true,
    });
    await expect(
      await canvas.findByText("Some invitations were not sent"),
    ).toBeVisible();
    await expect(canvas.queryByRole("switch")).not.toBeInTheDocument();
  },
});
