export function describeTeamInviteResult({
  invitedCount,
  notifiedCount,
}: {
  invitedCount: number;
  notifiedCount: number;
}) {
  const parts: string[] = [];
  if (invitedCount > 0) {
    parts.push(
      `Invited ${invitedCount} ${invitedCount === 1 ? "person" : "people"}`,
    );
  }
  if (notifiedCount > 0) {
    parts.push(
      `notified ${notifiedCount} member${notifiedCount === 1 ? "" : "s"}`,
    );
  }
  const sentence = parts.join(" and ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
