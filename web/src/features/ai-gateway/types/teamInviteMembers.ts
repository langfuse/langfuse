import type { RouterOutputs } from "@/src/utils/api";

export type TeamInviteMember = NonNullable<
  RouterOutputs["aiGateway"]["getInviteeMembers"][number]["member"]
>;

/**
 * Invitee address (lowercase) to its organization member, or null when the
 * address is not in the organization yet. Addresses missing from the map are
 * still being looked up.
 */
export type TeamInviteMembers = ReadonlyMap<string, TeamInviteMember | null>;
