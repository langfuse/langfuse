import { type NavigationItem } from "@/src/components/layouts/layout";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
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
    .filter((item) => Boolean(item.url))
    .map((item) => ({
      title: item.title,
      url: item.url,
    }));

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
    <CommandDialog open={open} onOpenChange={setOpen}>
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
