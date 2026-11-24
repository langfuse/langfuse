import { api } from "@/src/utils/api";

/** useGroupOrgMembers loads the organization's members that can be added to a group, as picker options. */
export function useGroupOrgMembers(orgId: string) {
  return api.groups.orgMembers.useQuery(
    { orgId },
    {
      select: (users) =>
        users.map((user) => ({
          value: user.id,
          label: user.name ?? user.email ?? user.id,
          secondaryLabel: user.name ? (user.email ?? undefined) : undefined,
        })),
    },
  );
}
