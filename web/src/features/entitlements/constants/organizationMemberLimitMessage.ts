/** Shown when an invite would pass the organization's member seat limit. */
export function organizationMemberLimitMessage(
  currentUsage: number,
  limit: number,
) {
  return `This organization is at its member limit (${currentUsage} of ${limit}). Remove a member or a pending invite, or upgrade the plan, before inviting someone else.`;
}
