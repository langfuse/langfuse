import * as React from "react";
import { Archive, ChevronDown, Component, Search } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Separator } from "@/src/components/ui/separator";

type MultiSelectOptions = {
  value: string;
  key?: string;
  count?: number;
  disabled?: boolean;
  isArchived?: boolean;
};

type MultiSelectGroup = {
  label: string;
  options: MultiSelectOptions[];
};

type MultiSelectKeyValuesProps<
  T extends { key: string; value: string } | string,
> = {
  values: T[];
  onValueChange: (
    values: T[],
    changedValue?: string,
    selectedKeys?: Set<string>,
  ) => void;
  options: MultiSelectOptions[] | readonly MultiSelectOptions[];
  title?: string;
  placeholder?: string;
  groupedOptions?: MultiSelectGroup[];
  className?: string;
  disabled?: boolean;
  items?: string;
  align?: "center" | "end" | "start";
  controlButtons?: React.ReactNode;
  hideClearButton?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  variant?: "outline" | "secondary" | "ghost";
  showSelectedValueStrings?: boolean;
};

export function MultiSelectKeyValues<
  T extends { key: string; value: string } | string,
>({
  title = "Select",
  placeholder,
  values,
  onValueChange,
  options,
  groupedOptions,
  className,
  disabled,
  items = "items",
  align = "center",
  controlButtons,
  hideClearButton = false,
  iconLeft,
  iconRight,
  variant = "secondary",
  showSelectedValueStrings = true,
}: MultiSelectKeyValuesProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const selectedValueKeys = new Set(
    values.map((value) => (typeof value === "string" ? value : value.key)),
  );
  const showClearItems = selectedValueKeys.size > 0 && !hideClearButton;

  function formatFilterValues(): T[] {
    if (values.length > 0 && typeof values[0] === "string") {
      return Array.from(selectedValueKeys) as T[];
    }

    const allOptions = groupedOptions
      ? groupedOptions.flatMap((group) => group.options)
      : options || [];

    return allOptions
      .filter((option) => !!option.key && selectedValueKeys.has(option.key))
      .map((option) => ({
        key: option.key as string,
        value: option.value,
      })) as T[];
  }

  const filterOptions = (options: MultiSelectOptions[]) => {
    if (!searchQuery.trim()) return options;
    const searchLower = searchQuery.toLowerCase().trim();

    return options.filter((option) => {
      const valueLower = option.value.toLowerCase();
      const keyLower = option.key?.toLowerCase() || "";
      return valueLower.includes(searchLower) || keyLower.includes(searchLower);
    });
  };

  const renderOption = (option: MultiSelectOptions) => {
    const isSelected = selectedValueKeys.has(option.key ?? option.value);
    return (
      <DropdownMenuCheckboxItem
        key={option.key ?? option.value}
        checked={isSelected}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={() => {
          const value = option.key ?? option.value;
          if (isSelected) {
            selectedValueKeys.delete(value);
          } else {
            selectedValueKeys.add(value);
          }
          const filterValues = formatFilterValues();
          onValueChange(
            filterValues.length ? filterValues : [],
            value,
            selectedValueKeys,
          );
        }}
        disabled={option.disabled}
        className="group"
      >
        <span
          className={cn(
            "capitalize",
            option.isArchived ? "text-foreground/50" : "",
          )}
        >
          {option.value}
        </span>
        {option.isArchived && (
          <Archive className="ml-2 h-4 w-4 text-foreground/50" />
        )}
        {option.count !== undefined && (
          <span className="ml-auto font-mono text-xs">{option.count}</span>
        )}
      </DropdownMenuCheckboxItem>
    );
  };

  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    inputRef.current?.focus();
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchQuery("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-md px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          disabled={disabled}
        >
          {iconLeft}
          {title}
          {iconRight}
          <ChevronDown className="h-4 w-4 opacity-50" />
          {selectedValueKeys.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValueKeys.size}
              </Badge>
              <div className="hidden space-x-1 overflow-x-auto lg:flex">
                {selectedValueKeys.size > 2 || !showSelectedValueStrings ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValueKeys.size}
                  </Badge>
                ) : (
                  options
                    .filter((option) =>
                      selectedValueKeys.has(option.key ?? option.value),
                    )
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.key}
                        className="rounded-sm px-1 font-normal capitalize"
                      >
                        {option.value}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[200px]"
        onPointerDownOutside={() => setIsOpen(false)}
      >
        <div
          className="flex items-center border-b px-2 py-1"
          onClick={handleInputClick}
        >
          <Search className="mr-1 h-3 w-3 opacity-50" />
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-6 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {options &&
            options.length > 0 &&
            filterOptions(Array.from(options)).map(renderOption)}

          {groupedOptions?.map((group) => {
            const filteredGroupOptions = filterOptions(group.options);
            if (filteredGroupOptions.length === 0) return null;

            return (
              <DropdownMenuSub key={group.label}>
                <DropdownMenuSubTrigger className="flex w-full cursor-default select-none items-center">
                  <Component className="mr-2 h-4 w-4 opacity-50" />
                  <span>{group.label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                  {filteredGroupOptions.map(renderOption)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}

          {searchQuery &&
            (!options || filterOptions(Array.from(options)).length === 0) &&
            (!groupedOptions ||
              !groupedOptions.some(
                (group) => filterOptions(group.options).length > 0,
              )) && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No results found.
              </div>
            )}

          {showClearItems && !searchQuery && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onValueChange([]);
                }}
              >
                Clear {items}
              </DropdownMenuItem>
            </>
          )}
          {controlButtons && (
            <>
              <DropdownMenuSeparator />
              {controlButtons}
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
