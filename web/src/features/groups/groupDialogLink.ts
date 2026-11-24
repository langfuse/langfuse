import { useRouter } from "next/router";

const GROUP_PARAM = "group";

/** The group a link points at, read from its `?group=<id>` parameter. */
export const groupIdFromHref = (href: string) =>
  new URLSearchParams(href.split("?")[1] ?? "").get(GROUP_PARAM);

/** The group whose dialog is open on the current page, kept in `?group=<id>`. */
export function useGroupDialogParam() {
  const router = useRouter();
  const value = router.query[GROUP_PARAM];
  const groupId = typeof value === "string" ? value : undefined;
  const setGroupId = (id: string | undefined) => {
    const query = { ...router.query };
    delete query[GROUP_PARAM];
    if (id) query[GROUP_PARAM] = id;
    router
      .push({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      })
      .catch(() => undefined);
  };
  return [groupId, setGroupId] as const;
}
