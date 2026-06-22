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
  defaultFilter,
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
 * Score the search only against the visible name (passed through `keywords`),
 * never the id in `value`. `value` stays the id so cmdk can disambiguate
 * same-named orgs/projects, but the id must not leak into the fuzzy match
 * (otherwise e.g. "seed" matches "Langfuse Demo" via its id "demo-org-id").
 */
const filterByName = (
  _value: string,
  search: string,
  keywords?: string[],
): number => defaultFilter?.(keywords?.join(" ") ?? "", search) ?? 0;

/**
 * A searchable switcher dropdown (org or project) rendered as a Popover + cmdk
 * Command. The header link and footer action live outside the CommandList so
 * they are never filtered out by the search. `items === undefined` means the
 * session is still loading.
 *
 * Rows render their content as real `<Link>` anchors so the browser keeps
 * middle-click, ⌘/Ctrl+Click "open in new tab", the right-click context menu,
 * and the URL hover preview. `onSelect` is retained for cmdk keyboard nav
 * (Enter); the anchor's `onClick` stops propagation so a left-click navigates
 * once rather than also firing `onSelect`.
 */
export const SwitcherMenu = ({
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
