import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Check,
  ChevronsUpDown,
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
import {
  ModelParamsSettingsButton,
  type ModelParamsContext,
} from "@/src/components/ModelParameters";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

export type JudgeModelMode = "default" | "custom";

/**
 * Judge model picker: one searchable dropdown with the project default
 * pinned on top and all connected models grouped by provider, plus a
 * "Params" button for the advanced model settings (custom models only —
 * the project default carries its own params).
 */
export function JudgeModelSection({
  projectId,
  mode,
  onModeChange,
  modelParamsContext,
}: {
  projectId: string;
  mode: JudgeModelMode;
  onModeChange: (mode: JudgeModelMode) => void;
  modelParamsContext: ModelParamsContext;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const {
    modelParams,
    providerModelCombinations,
    updateModelParamValue,
    setModelParamEnabled,
  } = modelParamsContext;

  // "provider: model" strings → ordered provider groups.
  const providerGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const combination of providerModelCombinations) {
      const separator = combination.indexOf(": ");
      if (separator === -1) continue;
      const provider = combination.slice(0, separator);
      const model = combination.slice(separator + 2);
      const existing = groups.get(provider);
      if (existing) {
        existing.push(model);
      } else {
        groups.set(provider, [model]);
      }
    }
    return Array.from(groups.entries());
  }, [providerModelCombinations]);

  const selectCustom = (provider: string, model: string) => {
    updateModelParamValue("provider", provider);
    updateModelParamValue("model", model);
    onModeChange("custom");
    setOpen(false);
  };

  const customSelectionLabel =
    modelParams.provider.value && modelParams.model.value
      ? `${modelParams.provider.value} / ${modelParams.model.value}`
      : "Select a model...";

  return (
    <div className="flex max-w-xl flex-col gap-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-8 min-w-0 flex-1 justify-between font-normal"
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
                  <span className="text-muted-foreground">
                    Select a model...
                  </span>
                )
              ) : (
                <span className="truncate" title={customSelectionLabel}>
                  {customSelectionLabel}
                </span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="start">
            <Command>
              <CommandInput placeholder="Find a model..." />
              <CommandList>
                <CommandEmpty>No model found.</CommandEmpty>
                {defaultModel && (
                  <>
                    <CommandGroup>
                      <CommandItem
                        value={`project-default ${defaultModel.provider} ${defaultModel.model}`}
                        onSelect={() => {
                          onModeChange("default");
                          setOpen(false);
                        }}
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
                )}
                {providerGroups.map(([provider, models]) => (
                  <CommandGroup key={provider} heading={provider}>
                    {models.map((model) => {
                      const isSelected =
                        mode === "custom" &&
                        modelParams.provider.value === provider &&
                        modelParams.model.value === model;
                      const isProjectDefault =
                        defaultModel?.provider === provider &&
                        defaultModel?.model === model;
                      return (
                        <CommandItem
                          key={model}
                          value={`${provider} ${model}`}
                          onSelect={() => selectCustom(provider, model)}
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
                          {isProjectDefault && (
                            <Badge
                              variant="outline"
                              size="sm"
                              className="text-muted-foreground ml-auto shrink-0 font-normal"
                            >
                              default
                            </Badge>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
              {/* Pinned footer — stays visible while the model list scrolls. */}
              <div className="flex flex-col border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onClick={() => {
                    router
                      .push(`/project/${projectId}/settings/llm-connections`)
                      .catch(() => undefined);
                  }}
                >
                  <Plug className="text-muted-foreground mr-2 h-3.5 w-3.5" />
                  Configure AI providers
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onClick={() => {
                    router
                      .push(`/project/${projectId}/evals/default-model`)
                      .catch(() => undefined);
                  }}
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

        <ModelParamsSettingsButton
          modelParams={modelParams}
          updateModelParamValue={updateModelParamValue}
          setModelParamEnabled={setModelParamEnabled}
          formDisabled={mode === "default"}
          label="Params"
        />
      </div>

      {mode === "default" && !defaultModel && (
        <p className="text-dark-yellow flex items-center gap-1 text-sm">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            No default evaluation model set — pick a model above or set a
            project default.
          </span>
        </p>
      )}
    </div>
  );
}
