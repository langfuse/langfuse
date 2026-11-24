import Link from "next/link";
import { type ComponentProps } from "react";

import {
  groupIdFromHref,
  useGroupDialogParam,
} from "@/src/features/groups/groupDialogLink";

/** Links to a group. A plain click opens its dialog over the current page; the address is for new tabs. */
export function GroupLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const [, setGroupId] = useGroupDialogParam();
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        const groupId = groupIdFromHref(href);
        const opensNewTab =
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey;
        if (!groupId || event.defaultPrevented || opensNewTab) return;
        event.preventDefault();
        setGroupId(groupId);
      }}
    />
  );
}
