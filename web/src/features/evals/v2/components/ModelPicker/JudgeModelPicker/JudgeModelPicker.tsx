import {
  Check,
  ChevronDown,
  Plug,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { selectTriggerClassName } from "@/src/components/ui/select";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { cn } from "@/src/utils/tailwind";

export type JudgeModelMode = "default" | "custom";

/** A controlled model selection menu for LLM-as-a-judge evaluators. */
export function JudgeModelPicker({
  open,
  onOpenChange,
  mode,
  defaultModel,
  providerGroups,
  selectedModel,
  disabled,
  onModeChange,
  onSelectCustom,
  onConfigureProviders,
  onConfigureDefault,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: JudgeModelMode;
  defaultModel?: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  selectedModel: JudgeModel | null;
  disabled: boolean;
  onModeChange: (mode: JudgeModelMode) => void;
  onSelectCustom: (model: JudgeModel) => void;
  onConfigureProviders: () => void;
  onConfigureDefault: () => void;
}) {
  const customSelectionLabel = selectedModel
    ? `${selectedModel.provider} / ${selectedModel.model}`
    : "Select a model...";

  // Command selections do not close this controlled popover automatically.
  // Close it before the callback can navigate or open another surface.
  const selectAndClose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            selectTriggerClassName,
            "w-fit max-w-full min-w-0",
            mode === "custom" && "rounded-r-none",
          )}
        >
          {mode === "default" ? (
            defaultModel ? (
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="truncate"
                  title={`${defaultModel.provider} / ${defaultModel.model}`}
                >
                  {defaultModel.provider} / {defaultModel.model}
                </span>
                <Badge variant="secondary" size="sm" className="shrink-0">
                  Project default
                </Badge>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <TriangleAlert className="text-dark-yellow h-3.5 w-3.5 shrink-0" />
                <span className="text-muted-foreground">Select a model...</span>
              </span>
            )
          ) : (
            <span className="truncate" title={customSelectionLabel}>
              {customSelectionLabel}
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a model..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {defaultModel ? (
              <>
                <CommandGroup>
                  <CommandItem
                    value={`project-default ${defaultModel.provider} ${defaultModel.model}`}
                    onSelect={() =>
                      selectAndClose(() => onModeChange("default"))
                    }
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        mode === "default" ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Sparkles className="text-muted-foreground mr-2 h-4 w-4 shrink-0" />
                    <span
                      className="truncate"
                      title={`${defaultModel.provider} / ${defaultModel.model}`}
                    >
                      {defaultModel.provider} / {defaultModel.model}
                    </span>
                    <Badge
                      variant="secondary"
                      size="sm"
                      className="ml-auto shrink-0"
                    >
                      Project default
                    </Badge>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            {providerGroups.map(([provider, models]) => (
              <CommandGroup key={provider} heading={provider}>
                {models.map((model) => {
                  const isSelected =
                    mode === "custom" &&
                    selectedModel?.provider === provider &&
                    selectedModel.model === model;
                  const isProjectDefault =
                    defaultModel?.provider === provider &&
                    defaultModel.model === model;
                  return (
                    <CommandItem
                      key={model}
                      value={`${provider} ${model}`}
                      onSelect={() =>
                        selectAndClose(() =>
                          onSelectCustom({ provider, model }),
                        )
                      }
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate" title={model}>
                        {model}
                      </span>
                      {isProjectDefault ? (
                        <Badge
                          variant="outline"
                          size="sm"
                          className="text-muted-foreground font-regular ml-auto shrink-0"
                        >
                          default
                        </Badge>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex flex-col border-t p-1">
            <Button
              type="button"
              variant="ghost"
              className="font-regular justify-start"
              onClick={() => selectAndClose(onConfigureProviders)}
            >
              <Plug className="text-muted-foreground mr-2 h-3.5 w-3.5" />
              Configure AI providers
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="font-regular justify-start"
              onClick={() => selectAndClose(onConfigureDefault)}
            >
              <Sparkles className="text-muted-foreground mr-2 h-3.5 w-3.5" />
              {defaultModel
                ? "Change project default"
                : "Set a project default"}
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
