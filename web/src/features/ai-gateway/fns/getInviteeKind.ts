import { z } from "zod/v4";

import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

/**
 * Whether an invitee address is a member to notify, someone to invite, an
 * address that gets no email (the sender, or a member whose role can't use the
 * gateway), or not known yet.
 */
export function getInviteeKind(email: string, members: TeamInviteMembers) {
  if (!z.email().safeParse(email).success) return "invalid";
  const member = members.get(email);
  if (member === undefined) return "pending";
  if (member === null) return "external";
  if (member.isSelf) return "self";
  if (!member.canUseGateway) return "memberWithoutAccess";
  return "member";
}
