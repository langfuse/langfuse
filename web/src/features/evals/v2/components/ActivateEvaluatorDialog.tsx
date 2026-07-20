import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { ActivationCostEstimate } from "@/src/features/evals/v2/components/ActivationCostEstimate";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

const SETUP_SCOPE_VALUE = "setup";

export function ActivateEvaluatorDialog({
  projectId,
  evaluatorId,
  evaluatorName,
  targetObject,
  setupFilter,
  setupSampling,
  testRunCostUsd,
  isCodeEvaluator,
  open,
  onOpenChange,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  targetObject: string;
  setupFilter: FilterState;
  setupSampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();
  const [selectedScope, setSelectedScope] = useState(SETUP_SCOPE_VALUE);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const scopes = api.evalsV2.runScopes.useQuery(
    { projectId },
    { enabled: open },
  );
  const compatibleScopes = (scopes.data ?? []).filter(
    (scope) => scope.targetObject === targetObject,
  );
  const selectedExistingScope = compatibleScopes.find(
    (scope) => scope.id === selectedScope,
  );
  const selectedScopeName = selectedExistingScope?.name ?? "Filters from setup";
  const selectedFilter = selectedExistingScope?.filter ?? setupFilter;
  const selectedSampling = selectedExistingScope?.sampling ?? setupSampling;

  const activate = api.evalsV2.activateRule.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: () => {
      Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]).catch(
        () => undefined,
      );
      showSuccessToast({
        title: "Evaluator is live",
        description: `“${evaluatorName}” will evaluate new matching observations.`,
      });
      onOpenChange(false);
    },
  });

  const handleActivate = () => {
    activate.mutate({
      projectId,
      evaluatorId,
      scope:
        selectedScope === SETUP_SCOPE_VALUE
          ? { mode: "setup" }
          : { mode: "existing", runScopeId: selectedScope },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Evaluator saved</DialogTitle>
          <DialogDescription className="mt-1.5">
            Congratulations, your evaluator was saved. Do you want to run it on
            live data?
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-4">
          <div className="flex flex-col gap-2">
            <Label>Live data scope</Label>
            <Popover open={scopePickerOpen} onOpenChange={setScopePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={scopePickerOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate" title={selectedScopeName}>
                    {selectedScopeName}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-96 p-0">
                <Command>
                  <CommandInput placeholder="Find a scope..." />
                  <CommandList>
                    <CommandEmpty>No scope found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="filters from setup"
                        onSelect={() => {
                          setSelectedScope(SETUP_SCOPE_VALUE);
                          setScopePickerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedScope === SETUP_SCOPE_VALUE
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            Filters from setup
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Configured while creating this evaluator
                          </span>
                        </span>
                      </CommandItem>
                    </CommandGroup>
                    {compatibleScopes.length > 0 ? (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Existing scopes">
                          {compatibleScopes.map((scope) => (
                            <CommandItem
                              key={scope.id}
                              value={`${scope.name} ${scope.id}`}
                              onSelect={() => {
                                setSelectedScope(scope.id);
                                setScopePickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedScope === scope.id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <span
                                className="min-w-0 truncate"
                                title={scope.name}
                              >
                                {scope.name}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    ) : null}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Filters</span>
              <span className="text-muted-foreground">
                {Math.round(selectedSampling * 100)}% sampling
              </span>
            </div>
            {selectedFilter.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <InlineFilterState
                  filterState={selectedFilter}
                  className="ml-0"
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                All matching observations
              </p>
            )}
          </div>

          <ActivationCostEstimate
            projectId={projectId}
            evaluatorId={evaluatorId}
            filter={selectedFilter}
            sampling={selectedSampling}
            testRunCostUsd={testRunCostUsd}
            isCodeEvaluator={isCodeEvaluator}
            enabled={open}
          />
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={activate.isPending}
            onClick={() => onOpenChange(false)}
          >
            Not now
          </Button>
          <Button
            type="button"
            loading={activate.isPending}
            onClick={handleActivate}
          >
            Run on live data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
