import { showSuccessToast, showToast } from "@/src/features/notifications";
import type { RouterOutputs } from "@/src/utils/api";

/** The server silently skips the caller's own address, and members it cannot email. */
export function showInviteOutcome({
  invitedCount,
  notifiedCount,
}: RouterOutputs["aiGateway"]["inviteTeam"]) {
  if (invitedCount + notifiedCount === 0) {
    showToast({
      type: "INFO",
      analytics: { operation: "aiGateway.inviteTeam" },
      title: "Nobody was notified: the addresses you entered get no email.",
    });
    return;
  }
  showSuccessToast({
    operation: "aiGateway.inviteTeam",
    title: "Team notified",
    description:
      invitedCount > 0
        ? "New people can create gateway keys once they join the organization."
        : "Members can now create their own gateway keys.",
  });
}
