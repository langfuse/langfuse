import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";
import type { TeamInviteMember } from "@/src/features/ai-gateway/types/teamInviteMembers";
import {
  GatewaySetupGuide,
  type GatewaySetupGuideProps,
} from "./GatewaySetupGuide";

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
];

/**
 * Holds the invitee list like the connected page does. `organizationMembers`
 * are the organization; every other address counts as someone to invite.
 */
function GatewaySetupGuideWithInvitees({
  notifiableMembers,
  ...props
}: Omit<GatewaySetupGuideProps, "recipients"> & {
  notifiableMembers: GatewaySetupGuideProps["recipients"]["notifiableMembers"];
}) {
  const invitees = useTeamInviteEmails();
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
      recipients={{
        notifiableMembers,
        suggestedMembers: organizationMembers,
        invitees,
        inviteeMembers,
      }}
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
