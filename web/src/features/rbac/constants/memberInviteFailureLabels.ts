import type { RouterOutputs } from "@/src/utils/api";

type MemberInviteFailureReason =
  RouterOutputs["members"]["create"]["failed"][number]["reason"];

/** Why an email was not invited, as the invite dialog shows it. */
export const MEMBER_INVITE_FAILURE_LABELS: Record<
  MemberInviteFailureReason,
  string
> = {
  already_member: "Already a member",
  pending_invite: "Already invited",
  seat_limit: "No seat left on your plan",
  other: "Couldn't send, try again",
};
