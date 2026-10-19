import { LangfuseConflictError } from "@langfuse/shared";

/** SeatLimitExceededError is a 409 for a membership or invitation that would take the organization past its plan's seat limit; members and pending invitations both hold a seat. */
export class SeatLimitExceededError extends LangfuseConflictError {
  constructor(readonly limit: number) {
    super(
      `This organization has reached its limit of ${limit} members, including pending invitations. Remove a member or invitation, or upgrade the plan, before adding another.`,
    );
  }
}
