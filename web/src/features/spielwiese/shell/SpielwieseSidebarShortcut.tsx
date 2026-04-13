import type { Ref } from "react";
import { FinderShortcut } from "./spielwieseHeaderFinderPrimitives";

const sidebarShortcutBadgeClassName =
  "-translate-x-1 border-black/[0.07] bg-black/[0.04] text-black/[0.46] opacity-0 shadow-none transition-[opacity,transform,background-color] duration-150 ease-out group-focus-within/sidebar-item:translate-x-[2px] group-focus-within/sidebar-item:opacity-100 group-hover/sidebar-item:translate-x-[2px] group-hover/sidebar-item:opacity-100 group-focus-visible/sidebar-item:translate-x-[2px] group-focus-visible/sidebar-item:opacity-100";

export function SpielwieseSidebarShortcut({
  label,
  shortcutRef,
}: {
  label: string;
  shortcutRef?: Ref<HTMLElement>;
}) {
  return (
    <span className="mr-1 ml-auto shrink-0">
      <FinderShortcut
        className={sidebarShortcutBadgeClassName}
        label={label}
        shortcutRef={shortcutRef}
      />
    </span>
  );
}
