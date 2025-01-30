import { type NavigationItem } from "@/src/components/layouts/layout";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export function CommandKMenu({
  mainNavigation,
}: {
  mainNavigation: NavigationItem[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const navItems = mainNavigation
    .flatMap((item) => [
      {
        title: item.title,
        url: item.url,
      },
      ...(item.items?.map((child) => ({
        title: `${item.title} > ${child.title}`,
        url: child.url,
      })) ?? []),
    ])
    .filter((item) => Boolean(item.url));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      filter={(value, search, keywords) => {
        const extendValue = value + " " + keywords?.join(" ");
        if (extendValue.toLowerCase().includes(search.toLowerCase())) return 1;
        return 0;
      }}
    >
      <CommandInput
        placeholder="Type a command or search..."
        className="border-none focus:border-none focus:outline-none focus:ring-0 focus:ring-transparent"
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Main Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.url}
              value={item.url}
              onSelect={() => {
                router.push(item.url);
                setOpen(false);
              }}
            >
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
