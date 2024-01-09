import React from "react";
import { cn } from "@/src/utils/tailwind";
import { CommandItem } from "cmdk";

export const TagItemCreate = ({
  inputValue,
  options,
  onSelect,
  onMouseDown,
}: {
  inputValue: string;
  options: string[];
  onSelect: () => void;
  onMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
}) => {
  const hasNoOption = !options
    .map((value) => value.toLowerCase())
    .includes(inputValue.toLowerCase());

  const render = inputValue !== "" && hasNoOption;

  if (!render) return null;

  return (
    <CommandItem
      key={inputValue}
      value={inputValue}
      className="flex cursor-pointer items-center rounded-sm p-2 px-1 py-2 text-muted-foreground hover:bg-secondary/80"
      onSelect={onSelect}
      onMouseDown={onMouseDown}
    >
      <div className={cn("mr-2 h-4 w-4")} />
      Create new tag: &quot;{inputValue}&quot;
    </CommandItem>
  );
};
