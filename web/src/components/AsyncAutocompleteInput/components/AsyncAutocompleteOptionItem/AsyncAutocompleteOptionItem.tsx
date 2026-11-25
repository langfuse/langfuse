import { createElement } from "react";
import { Check } from "@langfuse/icons";

import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/types/asyncAutocompleteOption";
import { CommandItem } from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";

export type AsyncAutocompleteOptionItemProps<V extends string> = {
  option: AsyncAutocompleteOption<V>;
  checked: boolean;
  onSelect: (option: AsyncAutocompleteOption<V>) => void;
};

export function AsyncAutocompleteOptionItem<V extends string>({
  option,
  checked,
  onSelect,
}: AsyncAutocompleteOptionItemProps<V>) {
  const visibleTitle =
    option.title ??
    [option.label, option.secondaryLabel].filter(Boolean).join(" ");

  const handleSelect = () => onSelect(option);

  return (
    <CommandItem
      value={`${option.value}:${option.label}`}
      disabled={option.disabled}
      aria-checked={checked}
      onSelect={handleSelect}
      className="ph-no-capture w-full"
    >
      {option.icon ? (
        <span className="text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-sm border">
          {createElement(option.icon, { size: "sm", "aria-hidden": true })}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          option.mono && "font-mono text-xs",
        )}
        title={visibleTitle}
      >
        {option.label}
        {option.secondaryLabel ? (
          <span className="text-muted-foreground ml-1.5 font-sans text-xs font-normal">
            {option.secondaryLabel}
          </span>
        ) : null}
      </span>
      <span className="flex w-3.5 shrink-0 items-center justify-center">
        {checked ? <Check size="base" aria-hidden /> : null}
      </span>
    </CommandItem>
  );
}
