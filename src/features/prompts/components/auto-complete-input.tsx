"use client";

import { Button } from "@/src/components/ui/button";
import * as React from "react";
import { Check, ChevronsUpDown, Edit2 } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";

export type AutocompleteInputProps = {
  options: { label: string; value: string }[];
};

// FIXME: https://twitter.com/lemcii/status/1659649371162419202?s=46&t=gqNnMIjMWXiG2Rbrr5gT6g
// Removing states would help maybe?

type Framework = Record<"value" | "label", string>;

const FRAMEWORKS = [
  {
    value: "next.js",
    label: "Next.js",
  },
  {
    value: "sveltekit",
    label: "SvelteKit",
  },
  {
    value: "nuxt.js",
    label: "Nuxt.js",
  },
  {
    value: "remix",
    label: "Remix",
  },
  {
    value: "astro",
    label: "Astro",
  },
  {
    value: "wordpress",
    label: "WordPress",
  },
] satisfies Framework[];

export function AutocompleteInput() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [frameworks, setFrameworks] = React.useState<Framework[]>(FRAMEWORKS);
  const [open, setOpen] = React.useState<boolean>(false);

  const [inputValue, setInputValue] = React.useState<string>("");
  const [selectedValues, setSelectedValues] = React.useState<Framework[]>([
    FRAMEWORKS[0],
  ]);

  const createFramework = (name: string) => {
    const newFramework = {
      value: name.toLowerCase(),
      label: name,
    };
    setFrameworks((prev) => [newFramework]);
    setSelectedValues((prev) => [newFramework]);
  };

  const toggleFramework = (framework: Framework) => {
    setSelectedValues(() => [framework]);
    inputRef.current?.focus();
  };

  return (
    <div className="">
      <Command>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput
            ref={inputRef}
            placeholder="Search framework..."
            value={inputValue}
            onValueChange={setInputValue}
          />

          <CommandGroup className="max-h-[145px] overflow-auto">
            {frameworks.map((framework) => {
              const isActive = selectedValues.includes(framework);
              return (
                <CommandItem
                  key={framework.value}
                  value={framework.value}
                  onSelect={() => toggleFramework(framework)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex-1">{framework.label}</div>
                </CommandItem>
              );
            })}

            <CommandItemCreate
              onSelect={() => createFramework(inputValue)}
              {...{ inputValue, frameworks }}
            />
          </CommandGroup>
        </CommandDialog>
      </Command>
    </div>
  );
}

const CommandItemCreate = ({
  inputValue,
  frameworks,
  onSelect,
}: {
  inputValue: string;
  frameworks: Framework[];
  onSelect: () => void;
}) => {
  const hasNoFramework = !frameworks
    .map(({ value }) => value)
    .includes(`${inputValue.toLowerCase()}`);

  const render = inputValue !== "" && hasNoFramework;

  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <CommandItem
      key={`${inputValue}`}
      value={`${inputValue}`}
      className="text-xs text-muted-foreground"
      onSelect={onSelect}
    >
      <div className={cn("mr-2 h-4 w-4")} />
      Create new label &quot;{inputValue}&quot;
    </CommandItem>
  );
};
