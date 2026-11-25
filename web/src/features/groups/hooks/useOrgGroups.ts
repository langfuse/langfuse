import { api } from "@/src/utils/api";

/** useOrgGroups loads the organization's groups with their members and roles. */
export function useOrgGroups(orgId: string) {
  return api.groups.list.useQuery({ orgId });
}
