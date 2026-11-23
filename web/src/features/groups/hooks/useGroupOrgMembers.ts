import { api } from "@/src/utils/api";

/** useGroupOrgMembers loads the organization's members that can be added to a group. */
export function useGroupOrgMembers(orgId: string) {
  return api.groups.orgMembers.useQuery({ orgId });
}
