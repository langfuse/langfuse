import { Fragment, type ReactNode, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { Settings } from "lucide-react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import { useRouter } from "next/router";
import Link from "next/link";
import { cn } from "@/src/utils/tailwind";

export type SwitcherItem = {
  id: string;
  name: string;
  href: string;
  settingsHref: string;
};

/**
 * Match the search against the name (via `keywords`) only, never the id in
 * `value`. `value` stays the id so cmdk can disambiguate same-named items.
 * Substring rather than cmdk's fuzzy scorer, which scores scattered-character
 * matches just above zero and so would leak unrelated rows into the list.
 */
const filterByName = (
  _value: string,
  search: string,
  keywords?: string[],
): number =>
  (keywords?.join(" ") ?? "").toLowerCase().includes(search.toLowerCase())
    ? 1
    : 0;

/**
 * Searchable org/project switcher: a Popover wrapping a cmdk Command. The
 * header link and footer sit outside the CommandList so search never filters
 * them; `items === undefined` means the session is still loading.
 *
 * Rows are real `<Link>` anchors so native middle/⌘-click "open in new tab",
 * the context menu, and hover preview keep working. `onSelect` handles the
 * keyboard (Enter); the anchor's `onClick` stops propagation so a left-click
 * navigates once instead of also firing `onSelect`.
 */
const SwitcherMenu = ({
  trigger,
  triggerClassName,
  headerLink,
  items,
  searchPlaceholder,
  emptyText,
  separatorBeforeId,
  footer,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  headerLink: { label: string; href: string };
  items: SwitcherItem[] | undefined;
  searchPlaceholder: string;
  emptyText: string;
  separatorBeforeId?: string;
  footer?: ReactNode;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn("text-primary flex items-center gap-1", triggerClassName)}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command filter={filterByName}>
          <Link
            href={headerLink.href}
            className="block px-3 py-2 text-sm font-semibold hover:underline"
            onClick={() => setOpen(false)}
          >
            {headerLink.label}
          </Link>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            {items === undefined ? (
              <div className="text-muted-foreground flex items-center px-3 py-2 text-sm">
                <span className="mr-1.5 inline-flex">
                  <Spinner size="sm" />
                </span>
                Loading...
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {items.map((item) => (
                    <Fragment key={item.id}>
                      {separatorBeforeId === item.id && <CommandSeparator />}
                      <CommandItem
                        value={item.id}
                        keywords={[item.name]}
                        onSelect={() => navigate(item.href)}
                        className="cursor-pointer justify-between"
                      >
                        <Link
                          href={item.href}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                          }}
                          className="min-w-0 flex-1"
                        >
                          <span
                            className="block overflow-hidden text-ellipsis whitespace-nowrap"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </Link>
                        <Button
                          asChild
                          variant="ghost"
                          size="xs"
                          className="hover:bg-background -my-1 shrink-0"
                        >
                          <Link
                            href={item.settingsHref}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen(false);
                            }}
                          >
                            <Settings size={12} />
                          </Link>
                        </Button>
                      </CommandItem>
                    </Fragment>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {footer ? (
            <>
              <CommandSeparator />
              <div className="p-1">{footer}</div>
            </>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SwitcherMenu;
