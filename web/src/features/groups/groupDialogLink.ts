import { useRouter } from "next/router";

const GROUP_PARAM = "group";

export const groupDialogHref = (orgId: string, groupId: string) =>
  `/organization/${orgId}/settings/groups?${GROUP_PARAM}=${encodeURIComponent(groupId)}`;

export const projectGroupDialogHref = (projectId: string, groupId: string) =>
  `/project/${projectId}/settings/groups?${GROUP_PARAM}=${encodeURIComponent(groupId)}`;

export function useGroupDialogParam() {
  const router = useRouter();
  const value = router.query[GROUP_PARAM];
  const groupId = typeof value === "string" ? value : undefined;
  const setGroupId = (id: string | undefined) => {
    const query = { ...router.query };
    delete query[GROUP_PARAM];
    if (id) query[GROUP_PARAM] = id;
    // Replaces the entry, so opening and closing a group never adds a Back step.
    router
      .replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      })
      .catch(() => undefined);
  };
  return [groupId, setGroupId] as const;
}
