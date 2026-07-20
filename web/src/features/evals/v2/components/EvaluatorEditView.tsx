import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
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
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  RuleSetupForm,
  type CatalogTemplate,
  type RuleSetupScopeControls,
} from "@/src/features/evals/v2/components/RuleSetupForm";
import { generateRunScopeName } from "@/src/features/evals/v2/components/RunScopeSection";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type ObservationVariableMapping } from "@langfuse/shared";

type RunScope = {
  id: string;
  name: string;
  filter: RuleSetupScopeControls["filterState"];
  sampling: number;
};

type ScopeControlsProps = RuleSetupScopeControls & {
  customFiltersDirty: boolean;
  initiallyAttachedScopeIds: string[];
  pendingAttachedScopeIds: string[];
  selectedScopeId: string | null;
  scopes: RunScope[];
  onSelectScope: (scopeId: string) => void;
  onSelectCustomFilters: () => void;
  onSelectOverview: () => void;
};

function FilterSourcePicker({
  customFiltersDirty,
  initiallyAttachedScopeIds,
  pendingAttachedScopeIds,
  selectedScopeId,
  scopes,
  setFilterState,
  setSampling,
  onSelectScope,
  onSelectCustomFilters,
  onSelectOverview,
}: ScopeControlsProps) {
  const [open, setOpen] = useState(false);
  const attachedScopes = scopes.filter((scope) =>
    pendingAttachedScopeIds.includes(scope.id),
  );
  const availableScopes = scopes.filter(
    (scope) => !pendingAttachedScopeIds.includes(scope.id),
  );
  const selectedScopeLabel =
    scopes.find((scope) => scope.id === selectedScopeId)?.name ??
    (selectedScopeId === null && customFiltersDirty ? "New scope" : null);
  const attachedScopeCountLabel = `${pendingAttachedScopeIds.length} attached scope${pendingAttachedScopeIds.length === 1 ? "" : "s"}`;

  const selectScope = (scope: RunScope) => {
    setFilterState(scope.filter);
    setSampling(scope.sampling);
    onSelectScope(scope.id);
    setOpen(false);
  };

  const selectOverview = () => {
    setFilterState([]);
    setSampling(1);
    onSelectOverview();
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-fit max-w-full min-w-0 justify-between font-normal"
            title={selectedScopeLabel ?? attachedScopeCountLabel}
          >
            {selectedScopeLabel ? (
              <span className="max-w-64 truncate" title={selectedScopeLabel}>
                {selectedScopeLabel}
              </span>
            ) : (
              <>
                <span className="whitespace-nowrap">Attached scopes</span>
                <span className="bg-muted ml-2 rounded-sm px-1.5 py-0.5 text-xs tabular-nums">
                  {pendingAttachedScopeIds.length}
                </span>
              </>
            )}
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-0">
          <Command>
            <CommandInput placeholder="Find or attach a run scope..." />
            <CommandList>
              <CommandEmpty>No run scope found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="new scope custom filters"
                  onSelect={() => {
                    if (selectedScopeId === null && customFiltersDirty) {
                      setOpen(false);
                      return;
                    }
                    setFilterState([]);
                    setSampling(1);
                    onSelectCustomFilters();
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      selectedScopeId === null && customFiltersDirty
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  New scope
                </CommandItem>
              </CommandGroup>
              {attachedScopes.length > 0 ? (
                <CommandGroup heading="Attached run scopes">
                  {attachedScopes.map((scope) => (
                    <CommandItem
                      key={scope.id}
                      value={`${scope.name} ${scope.id}`}
                      onSelect={() => selectScope(scope)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selectedScopeId === scope.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={scope.name}
                      >
                        {scope.name}
                      </span>
                      {!initiallyAttachedScopeIds.includes(scope.id) ? (
                        <span className="text-muted-foreground text-xs">
                          New
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Attach a run scope">
                {availableScopes.map((scope) => (
                  <CommandItem
                    key={scope.id}
                    value={`${scope.name} ${scope.id}`}
                    onSelect={() => selectScope(scope)}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="truncate" title={scope.name}>
                      {scope.name}
                    </span>
                  </CommandItem>
                ))}
                {availableScopes.length === 0 ? (
                  <div className="text-muted-foreground px-2 py-1.5 text-sm">
                    All run scopes are attached
                  </div>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedScopeLabel ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Clear scope selection"
          title="Back to attached scopes"
          onClick={selectOverview}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

type ScopeSaveDecision =
  | { type: "create"; name: string }
  | { type: "discard" }
  | { type: "cancel" };

function SaveCustomFiltersDialog({
  open,
  scopeName,
  onScopeNameChange,
  onResolve,
}: {
  open: boolean;
  scopeName: string;
  onScopeNameChange: (name: string) => void;
  onResolve: (decision: ScopeSaveDecision) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onResolve({ type: "cancel" });
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save test filters?</DialogTitle>
          <DialogDescription>
            These custom filters currently only affect the observation preview
            and test. Save them as a new run scope to use them with this
            evaluator.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-run-scope-name">Run scope name</Label>
            <Input
              id="new-run-scope-name"
              value={scopeName}
              onChange={(event) => onScopeNameChange(event.target.value)}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onResolve({ type: "cancel" })}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onResolve({ type: "discard" })}
          >
            Don’t save filters
          </Button>
          <Button
            type="button"
            disabled={!scopeName.trim()}
            onClick={() =>
              onResolve({ type: "create", name: scopeName.trim() })
            }
          >
            Save as new and attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EvaluatorEditView({
  projectId,
  evaluatorId,
  sourceTemplate,
  initialMapping,
  scoreName,
  description,
  attachedScopeIds,
  initialRunScopeId,
  initialNewScope,
  scopeControlsContainer,
  onSaved,
  onCancel,
}: {
  projectId: string;
  evaluatorId: string;
  sourceTemplate: CatalogTemplate;
  initialMapping: ObservationVariableMapping[];
  scoreName: string;
  description: string;
  attachedScopeIds: string[];
  initialRunScopeId?: string;
  initialNewScope?: boolean;
  scopeControlsContainer?: HTMLElement | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const utils = api.useUtils();
  const runScopes = api.evalsV2.runScopes.useQuery({ projectId });
  const attachScope = api.evalsV2.attachEvaluatorToRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const detachScope = api.evalsV2.detachEvaluatorFromRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const createScope = api.evalsV2.createRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(
    initialNewScope ? null : (initialRunScopeId ?? null),
  );
  const [pendingAttachedScopeIds, setPendingAttachedScopeIds] =
    useState(attachedScopeIds);
  const [selectedScopeFiltersEditable, setSelectedScopeFiltersEditable] =
    useState(false);
  const [customFiltersDirty, setCustomFiltersDirty] = useState(
    Boolean(initialNewScope),
  );
  const [saveScopeDialogOpen, setSaveScopeDialogOpen] = useState(false);
  const [newScopeName, setNewScopeName] = useState("");
  const saveDecisionResolver = useRef<
    ((decision: ScopeSaveDecision) => void) | null
  >(null);

  if (runScopes.isPending) {
    return <Skeleton className="m-6 h-96 w-auto" />;
  }

  const compatibleScopes = (runScopes.data ?? []).filter(
    (scope) => scope.targetObject === "event",
  );
  const selectedScope = compatibleScopes.find(
    (scope) => scope.id === selectedScopeId,
  );

  const resolveScopeSaveDecision = (decision: ScopeSaveDecision) => {
    const resolver = saveDecisionResolver.current;
    if (!resolver) return;
    saveDecisionResolver.current = null;
    setSaveScopeDialogOpen(false);
    resolver(decision);
  };

  const requestScopeSaveDecision = (
    filterState: RuleSetupScopeControls["filterState"],
  ) => {
    setNewScopeName(
      generateRunScopeName({
        filter: filterState,
        targetObject: "event",
        existingNames: compatibleScopes.map((scope) => scope.name),
      }),
    );
    setSaveScopeDialogOpen(true);
    return new Promise<ScopeSaveDecision>((resolve) => {
      saveDecisionResolver.current = resolve;
    });
  };

  const handleBeforeSave = async ({
    filterState,
    sampling,
  }: RuleSetupScopeControls) => {
    if (customFiltersDirty) {
      const decision = await requestScopeSaveDecision(filterState);
      if (decision.type === "cancel") return false;
      if (decision.type === "create") {
        await createScope.mutateAsync({
          projectId,
          evaluatorId,
          name: decision.name,
          targetObject: "event",
          filter: filterState,
          sampling,
        });
      }
      setCustomFiltersDirty(false);
    }

    const scopesToAttach = pendingAttachedScopeIds.filter(
      (scopeId) => !attachedScopeIds.includes(scopeId),
    );
    const scopesToDetach = attachedScopeIds.filter(
      (scopeId) => !pendingAttachedScopeIds.includes(scopeId),
    );
    await Promise.all([
      ...scopesToAttach.map((runScopeId) =>
        attachScope.mutateAsync({ projectId, evaluatorId, runScopeId }),
      ),
      ...scopesToDetach.map((runScopeId) =>
        detachScope.mutateAsync({ projectId, evaluatorId, runScopeId }),
      ),
    ]);
    await Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]);
    return true;
  };

  const handleSelectNewScope = () => {
    if (selectedScopeId && !attachedScopeIds.includes(selectedScopeId)) {
      setPendingAttachedScopeIds((current) =>
        current.filter((scopeId) => scopeId !== selectedScopeId),
      );
    }
    setSelectedScopeId(null);
    setSelectedScopeFiltersEditable(false);
    setCustomFiltersDirty(true);
  };

  const handleSelectScopeOverview = () => {
    if (selectedScopeId && !attachedScopeIds.includes(selectedScopeId)) {
      setPendingAttachedScopeIds((current) =>
        current.filter((scopeId) => scopeId !== selectedScopeId),
      );
    }
    setSelectedScopeId(null);
    setSelectedScopeFiltersEditable(false);
    setCustomFiltersDirty(false);
  };

  const handleFiltersEdited = () => {
    setCustomFiltersDirty(true);
  };

  return (
    <>
      <RuleSetupForm
        projectId={projectId}
        sourceTemplate={sourceTemplate}
        initialEvaluatorType={sourceTemplate.type === "CODE" ? "code" : "llm"}
        scoreName={scoreName}
        description={description}
        mode="edit"
        evaluatorId={evaluatorId}
        initialMapping={initialMapping}
        initialFilterState={selectedScope?.filter ?? []}
        initialSampling={selectedScope?.sampling ?? 1}
        filterEditingDisabled={
          selectedScopeId !== null && !selectedScopeFiltersEditable
        }
        activeFilterSourceLabel={selectedScope?.name}
        renderScopeControls={(controls) =>
          scopeControlsContainer
            ? createPortal(
                <>
                  <FilterSourcePicker
                    {...controls}
                    customFiltersDirty={customFiltersDirty}
                    initiallyAttachedScopeIds={attachedScopeIds}
                    pendingAttachedScopeIds={pendingAttachedScopeIds}
                    selectedScopeId={selectedScopeId}
                    scopes={compatibleScopes}
                    onSelectScope={(scopeId) => {
                      setSelectedScopeId(scopeId);
                      setPendingAttachedScopeIds((current) =>
                        current.includes(scopeId)
                          ? current
                          : [...current, scopeId],
                      );
                      setSelectedScopeFiltersEditable(false);
                      setCustomFiltersDirty(false);
                    }}
                    onSelectCustomFilters={handleSelectNewScope}
                    onSelectOverview={handleSelectScopeOverview}
                  />
                </>,
                scopeControlsContainer,
              )
            : null
        }
        renderFilterActions={({ setFilterState, setSampling }) =>
          selectedScopeId ? (
            <div className="flex shrink-0 items-center gap-0">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                aria-label="Edit run scope filters"
                title="Edit run scope filters"
                onClick={() => setSelectedScopeFiltersEditable(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                aria-label={
                  attachedScopeIds.includes(selectedScopeId)
                    ? "Detach run scope"
                    : "Cancel run scope attachment"
                }
                title={
                  attachedScopeIds.includes(selectedScopeId)
                    ? "Detach run scope"
                    : "Cancel run scope attachment"
                }
                onClick={() => {
                  setPendingAttachedScopeIds((current) =>
                    current.filter((id) => id !== selectedScopeId),
                  );
                  setSelectedScopeId(null);
                  setSelectedScopeFiltersEditable(false);
                  setFilterState([]);
                  setSampling(1);
                  setCustomFiltersDirty(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null
        }
        onFiltersEdited={handleFiltersEdited}
        onBeforeSave={handleBeforeSave}
        onSaved={onSaved}
        onCancel={onCancel}
      />

      <SaveCustomFiltersDialog
        open={saveScopeDialogOpen}
        scopeName={newScopeName}
        onScopeNameChange={setNewScopeName}
        onResolve={resolveScopeSaveDecision}
      />
    </>
  );
}
