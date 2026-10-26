import { z } from "zod/v4";

import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

/** Whether an invitee address is a member, someone to invite, or not known yet. */
export function getInviteeKind(email: string, members: TeamInviteMembers) {
  if (!z.email().safeParse(email).success) return "invalid";
  const member = members.get(email);
  if (member === undefined) return "pending";
  return member ? "member" : "external";
}
