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
      title: "No invitations sent: everyone you entered is already a member.",
    });
    return;
  }
  showSuccessToast({
    operation: "aiGateway.inviteTeam",
    title: "Invitations sent",
    description: "Invited people can create gateway keys once they join.",
  });
}
