import Link from "next/link";
import { flushSync } from "react-dom";
import { useAppNavigation } from "@/src/components/nav/AppNavigationProvider";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { assertUnreachable } from "@/src/utils/types";

type UserNavigationItemBase = {
  name: string;
  content?: React.ReactNode;
};

type UserNavigationLeafItem =
  | (UserNavigationItemBase & {
      type: "action";
      onClick: () => void;
      /** Root dialogs open after transient navigation releases its focus and inert state. */
      handoff?: "dialog";
    })
  | (UserNavigationItemBase & {
      type: "link";
      href: string;
    });

export type UserNavigationItem =
  | UserNavigationLeafItem
  | (UserNavigationItemBase & {
      type: "submenu";
      subItems: UserNavigationLeafItem[];
    });

function UserMenuItem({
  item,
  submenuSideOffset,
}: {
  item: UserNavigationItem;
  submenuSideOffset?: number;
}) {
  const navigation = useAppNavigation();
  if (item.type === "submenu") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {item.content ?? item.name}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent sideOffset={submenuSideOffset}>
          {item.subItems.map((subItem) => (
            <UserMenuItem key={subItem.name} item={subItem} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  if (item.type === "link") {
    return (
      <DropdownMenuItem asChild>
        <Link
          href={item.href}
          onNavigate={() => navigation?.closeTransientNavigation()}
        >
          {item.content ?? item.name}
        </Link>
      </DropdownMenuItem>
    );
  }

  if (item.type === "action") {
    return (
      <DropdownMenuItem
        onClick={() => {
          if (item.handoff === "dialog" && navigation) {
            flushSync(() => navigation.closeTransientNavigation());
          }
          item.onClick();
        }}
      >
        {item.content ?? item.name}
      </DropdownMenuItem>
    );
  }

  return assertUnreachable(item);
}

/** The account menu entries, rendered inside a dropdown menu content. */
export function UserMenuItems({
  items,
  submenuSideOffset,
}: {
  items: UserNavigationItem[];
  /** Negative values pull submenus over their parent, for menus as wide as the screen. */
  submenuSideOffset?: number;
}) {
  return (
    <>
      {items.map((item) => (
        <UserMenuItem
          key={item.name}
          item={item}
          submenuSideOffset={submenuSideOffset}
        />
      ))}
    </>
  );
}
