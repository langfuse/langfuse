import type { Role } from "@langfuse/shared";

import { getServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { env } from "@/src/env.mjs";
import { isRegionProduction } from "@/src/features/organizations/cloudRegions";

/** The feature an invitation was sent from. */
export type MemberInviteSource = "members" | "ai_gateway";

/** A pending invitation for a new address, or a membership for an existing account. */
type MemberInviteKind = "invitation" | "direct_membership";

// Server events, named apart from every client event. Metadata only: never
// emails, email domains or user ids as properties.
type MemberInviteEventProperties = {
  "members:invite_created": {
    kind: MemberInviteKind;
    orgRole: Role;
    hasProjectRole: boolean;
    source: MemberInviteSource;
  };
  "members:invite_accepted": {
    orgRole: Role;
    hasProjectRole: boolean;
    daysSinceInvite: number;
  };
  "members:invite_revoked": {
    orgRole: Role;
    hasProjectRole: boolean;
    daysSinceInvite: number;
  };
};

type RecordedInvitation = {
  orgRole: Role;
  projectRole: Role | null;
  createdAt: Date;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const describeInvitation = (invitation: RecordedInvitation, now: number) => ({
  orgRole: invitation.orgRole,
  hasProjectRole: invitation.projectRole !== null,
  daysSinceInvite: Math.floor(
    (now - invitation.createdAt.getTime()) / MILLISECONDS_PER_DAY,
  ),
});

/** Sent from production Cloud regions only; never throws or waits. */
function captureMemberInviteEvent<
  Event extends keyof MemberInviteEventProperties,
>(
  distinctId: string,
  event: Event,
  properties: MemberInviteEventProperties[Event],
) {
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  if (!region || !isRegionProduction(region)) return;
  // Analytics never fails an invite.
  try {
    getServerPosthog().capture({ distinctId, event, properties });
  } catch {}
}

/** Records an invitation or membership `inviterUserId` created. */
export function captureInviteCreated(
  inviterUserId: string,
  properties: MemberInviteEventProperties["members:invite_created"],
) {
  captureMemberInviteEvent(inviterUserId, "members:invite_created", properties);
}

/** Records each invitation a new user accepted. */
export function captureInvitationsAccepted(
  userId: string,
  invitations: RecordedInvitation[],
) {
  const now = Date.now();
  // Sign-up goes on (SFDC sync next) even if a row can't be read.
  try {
    for (const invitation of invitations) {
      captureMemberInviteEvent(
        userId,
        "members:invite_accepted",
        describeInvitation(invitation, now),
      );
    }
  } catch {}
}

/** Records a pending invitation `revokerUserId` deleted. */
export function captureInviteRevoked(
  revokerUserId: string,
  invitation: RecordedInvitation,
) {
  try {
    captureMemberInviteEvent(
      revokerUserId,
      "members:invite_revoked",
      describeInvitation(invitation, Date.now()),
    );
  } catch {}
}
