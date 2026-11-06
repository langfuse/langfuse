import Link from "next/link";
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

function UserMenuItem({ item }: { item: UserNavigationItem }) {
  if (item.type === "submenu") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {item.content ?? item.name}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
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
        <Link href={item.href}>{item.content ?? item.name}</Link>
      </DropdownMenuItem>
    );
  }

  if (item.type === "action") {
    return (
      <DropdownMenuItem onClick={item.onClick}>
        {item.content ?? item.name}
      </DropdownMenuItem>
    );
  }

  return assertUnreachable(item);
}

/** The account menu entries, rendered inside a dropdown menu content. */
export function UserMenuItems({ items }: { items: UserNavigationItem[] }) {
  return (
    <>
      {items.map((item) => (
        <UserMenuItem key={item.name} item={item} />
      ))}
    </>
  );
}
