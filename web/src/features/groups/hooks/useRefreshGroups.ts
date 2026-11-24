import { api } from "@/src/utils/api";

/** Refetches groups and the members tables, which show the roles groups give. */
export function useRefreshGroups() {
  const utils = api.useUtils();
  return () =>
    Promise.all([utils.groups.invalidate(), utils.members.invalidate()]).catch(
      () => undefined,
    );
}
