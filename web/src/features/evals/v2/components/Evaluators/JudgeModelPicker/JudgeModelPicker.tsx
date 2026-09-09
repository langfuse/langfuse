import {
  Check,
  ChevronDown,
  ExternalLink,
  Plug,
  Settings2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Badge } from "@/src/components/ui/badge";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { Popover, PopoverContent } from "@/src/components/ui/popover";
import { selectTriggerClassName } from "@/src/components/ui/select";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { cn } from "@/src/utils/tailwind";

type JudgeModelMode = "default" | "custom";

type JudgeModelPickerCommonProps = {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerGroups: Array<[string, string[]]>;
  onConfigureProviders: () => void;
  onConfigureModel: () => void;
  hasModelConfiguration?: boolean;
};

type EvaluatorJudgeModelPickerProps = JudgeModelPickerCommonProps & {
  purpose?: "evaluator";
  mode: JudgeModelMode;
  defaultModel?: JudgeModel | null;
  selectedModel: JudgeModel | null;
  onModeChange: (mode: JudgeModelMode) => void;
  onSelectCustom: (model: JudgeModel) => void;
  canSetProjectDefault: boolean;
  onSetProjectDefault: () => void;
};

type ProjectDefaultJudgeModelPickerProps = JudgeModelPickerCommonProps & {
  purpose: "projectDefault";
  defaultModel: JudgeModel | null;
  onSelectProjectDefault: (model: JudgeModel) => void;
};

export type JudgeModelPickerProps =
  | EvaluatorJudgeModelPickerProps
  | ProjectDefaultJudgeModelPickerProps;

type JudgeModelPickerTriggerProps = Omit<
  ButtonProps,
  "children" | "className" | "disabled" | "type" | "variant"
> & {
  mode: JudgeModelMode;
  defaultModel?: JudgeModel | null;
  selectedModel: JudgeModel | null;
  disabled: boolean;
  missingDefaultLabel?: string;
  borderVariant?: "default" | "contrast";
};

export const JudgeModelPickerTrigger = forwardRef<
  HTMLButtonElement,
  JudgeModelPickerTriggerProps
>(
  (
    {
      mode,
      defaultModel,
      selectedModel,
      missingDefaultLabel,
      // Handled here rather than by `Button`, which swaps its children for the
      // spinner. That would drop the model label mid-mutation and collapse this
      // content-width trigger, shifting everything next to it in the header.
      loading,
      loadingText,
      disabled,
      borderVariant = "default",
      ...buttonProps
    },
    forwardedRef,
  ) => {
    const customSelectionLabel = selectedModel
      ? `${selectedModel.provider} / ${selectedModel.model}`
      : "Select a model";
    const customSelectionIsDefault =
      mode === "custom" &&
      selectedModel !== null &&
      defaultModel != null &&
      selectedModel.provider === defaultModel.provider &&
      selectedModel.model === defaultModel.model;

    return (
      <Button
        {...buttonProps}
        ref={forwardedRef}
        type="button"
        variant="outline"
        disabled={disabled || loading}
        // The label stays put while loading, so announce the pending action
        // for anyone who cannot see the spinner.
        aria-label={loading && loadingText ? String(loadingText) : undefined}
        aria-busy={loading || undefined}
        className={cn(
          selectTriggerClassName,
          "w-auto max-w-full min-w-0 justify-start",
          borderVariant === "contrast" && "border-border-contrast",
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
              <span className="text-muted-foreground">
                {missingDefaultLabel ?? "Select a model"}
              </span>
            </span>
          )
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate" title={customSelectionLabel}>
              {customSelectionLabel}
            </span>
            {customSelectionIsDefault ? (
              <Badge variant="secondary" size="sm" className="shrink-0">
                Project default
              </Badge>
            ) : null}
          </span>
        )}
        {loading ? (
          <Spinner size="sm" variant="muted" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        )}
      </Button>
    );
  },
);
JudgeModelPickerTrigger.displayName = "JudgeModelPickerTrigger";

/** A controlled model selection menu for evaluators and the project default. */
export function JudgeModelPicker(props: JudgeModelPickerProps) {
  const {
    children,
    open,
    onOpenChange,
    defaultModel,
    providerGroups,
    onConfigureProviders,
    onConfigureModel,
    hasModelConfiguration = false,
  } = props;
  const selectsProjectDefault = props.purpose === "projectDefault";
  const selectedModel = selectsProjectDefault
    ? (defaultModel ?? null)
    : props.selectedModel;
  const selectedModelIsDefault =
    !selectsProjectDefault &&
    selectedModel !== null &&
    defaultModel != null &&
    selectedModel.provider === defaultModel.provider &&
    selectedModel.model === defaultModel.model;
  // Command selections do not close this controlled popover automatically.
  // Close it before the callback can navigate or open another surface.
  const selectAndClose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children}
      <PopoverContent
        className="w-96 p-0"
        align={selectsProjectDefault ? "end" : "start"}
      >
        <Command>
          <CommandInput placeholder="Find a model..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {!selectsProjectDefault && defaultModel ? (
              <>
                <CommandGroup>
                  <CommandItem
                    value={`project-default ${defaultModel.provider} ${defaultModel.model}`}
                    onSelect={() =>
                      selectAndClose(() => props.onModeChange("default"))
                    }
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        props.mode === "default" ? "opacity-100" : "opacity-0",
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
                    selectedModel?.provider === provider &&
                    selectedModel.model === model &&
                    (selectsProjectDefault || props.mode === "custom");
                  const isProjectDefault =
                    defaultModel?.provider === provider &&
                    defaultModel.model === model;
                  return (
                    <CommandItem
                      key={model}
                      value={`${provider} ${model}`}
                      disabled={selectsProjectDefault && isProjectDefault}
                      onSelect={() =>
                        selectAndClose(() => {
                          if (selectsProjectDefault) {
                            props.onSelectProjectDefault({ provider, model });
                          } else {
                            props.onSelectCustom({ provider, model });
                          }
                        })
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
              <ExternalLink className="text-muted-foreground ml-auto h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="font-regular justify-start"
              disabled={
                selectsProjectDefault
                  ? !defaultModel
                  : props.mode !== "custom" || !selectedModel
              }
              onClick={() => selectAndClose(onConfigureModel)}
            >
              <Settings2 className="text-muted-foreground mr-2 h-3.5 w-3.5" />
              Model configuration
              {hasModelConfiguration ? (
                <>
                  <span className="sr-only">Customized</span>
                  <span
                    aria-hidden="true"
                    className="relative ml-auto inline-flex h-2.5 w-2.5"
                  >
                    <span className="bg-dark-yellow absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                    <span className="bg-dark-yellow relative inline-flex h-2.5 w-2.5 rounded-full" />
                  </span>
                </>
              ) : null}
            </Button>
            {!selectsProjectDefault ? (
              <Button
                type="button"
                variant="ghost"
                className="font-regular justify-start"
                disabled={
                  props.mode !== "custom" ||
                  !selectedModel ||
                  selectedModelIsDefault ||
                  !props.canSetProjectDefault
                }
                onClick={() => selectAndClose(props.onSetProjectDefault)}
              >
                <Sparkles className="text-muted-foreground mr-2 h-3.5 w-3.5" />
                Set selected model as project default
              </Button>
            ) : null}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
