import { LangfuseConflictError } from "@langfuse/shared";

/** SeatLimitExceededError rejects a member or invitation beyond the plan's seat limit with a 409. */
export class SeatLimitExceededError extends LangfuseConflictError {
  constructor(readonly limit: number) {
    super(
      `This organization has reached its limit of ${limit} members, including pending invitations. Remove a member or invitation, or upgrade the plan, before adding another.`,
    );
  }
}
