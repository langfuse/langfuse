import type { MemberInviteSeatState } from "@/src/features/rbac/types/memberInviteAnalytics";

/** How `chipCount` addresses fit the seats a limited plan has left. */
export function getSeatState(
  seats: { used: number; max: number } | undefined,
  chipCount: number,
): MemberInviteSeatState {
  if (!seats) return "none";
  const openSeats = Math.max(0, seats.max - seats.used);
  if (openSeats === 0) return "full";
  // Before any address is added, the next invite takes one seat.
  const seatsToTake = Math.max(chipCount, 1);
  if (seatsToTake > openSeats) return "over";
  if (seatsToTake === openSeats) return "last";
  return "open";
}
