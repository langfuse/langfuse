import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Link2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { getRunScopeTracesHref } from "@/src/features/evals/v2/lib/runScopeTracesHref";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { type FilterState } from "@langfuse/shared";

export function EvaluatorRunScopeAssignments({
  projectId,
  evaluatorId,
  runScopes,
  hasWriteAccess,
  onAttach,
}: {
  projectId: string;
  evaluatorId: string;
  runScopes: Array<{
    id: string;
    name: string;
    filter: FilterState;
  }>;
  hasWriteAccess: boolean;
  onAttach: (runScopeId?: string, createNew?: boolean) => void;
}) {
  const utils = api.useUtils();
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [scopeToDetach, setScopeToDetach] = useState<
    (typeof runScopes)[number] | null
  >(null);
  const availableScopes = api.evalsV2.runScopes.useQuery(
    { projectId },
    { enabled: attachDialogOpen },
  );
  const attachedScopeIds = new Set(runScopes.map((scope) => scope.id));
  const unattachedScopes = (availableScopes.data ?? []).filter(
    (scope) =>
      scope.targetObject === "event" && !attachedScopeIds.has(scope.id),
  );
  const detachScope = api.evalsV2.detachEvaluatorFromRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: (_data, variables) => {
      const detachedScope = runScopes.find(
        (scope) => scope.id === variables.runScopeId,
      );
      setScopeToDetach(null);
      showSuccessToast({
        title: "Run scope detached",
        description: detachedScope
          ? `This evaluator no longer uses “${detachedScope.name}”.`
          : "This evaluator no longer uses the selected run scope.",
      });
      Promise.all([
        utils.evals.configById.invalidate({ projectId, id: evaluatorId }),
        utils.evalsV2.invalidate(),
      ]).catch(() => undefined);
    },
  });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label>Attached scopes</Label>
          <Badge variant="secondary" size="sm">
            {runScopes.length}
          </Badge>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess}
          onClick={() => setAttachDialogOpen(true)}
        >
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          Attach run scope
        </Button>
      </div>

      {runScopes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {runScopes.map((scope) => (
            <Collapsible
              key={scope.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-md border text-sm"
            >
              <div className="flex min-w-0 items-center px-1">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="group h-8 min-w-0 flex-1 justify-start overflow-hidden px-2 font-normal"
                    aria-label={`Toggle filters for ${scope.name}`}
                  >
                    <ChevronRight className="mr-2 h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                    <span className="truncate" title={scope.name}>
                      {scope.name}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link
                    href={getRunScopeTracesHref({
                      projectId,
                      evaluatorId,
                      runScopeId: scope.id,
                    })}
                    aria-label={`View execution traces for ${scope.name}`}
                  >
                    View traces
                  </Link>
                </Button>
                {hasWriteAccess ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`More actions for ${scope.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onAttach(scope.id)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setScopeToDetach(scope)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Detach
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-2 border-t px-3 py-2">
                  {scope.filter.length > 0 ? (
                    <InlineFilterState
                      filterState={scope.filter}
                      className="ml-0"
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      All matching observations
                    </span>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
          No run scope attached
        </div>
      )}

      <Dialog open={attachDialogOpen} onOpenChange={setAttachDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach run scope</DialogTitle>
            <DialogDescription>
              Create a new scope or attach one that already exists.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="gap-4">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start gap-3 px-3 py-3 text-left"
              onClick={() => {
                setAttachDialogOpen(false);
                onAttach(undefined, true);
              }}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex min-w-0 flex-col items-start">
                <span className="font-bold">Create new run scope</span>
                <span className="text-muted-foreground text-xs font-normal">
                  Define a new set of filters for this evaluator.
                </span>
              </span>
            </Button>

            <div className="flex flex-col gap-2">
              <Label>Existing run scopes</Label>
              {availableScopes.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <Command className="rounded-md border">
                  <CommandInput placeholder="Find a run scope..." />
                  <CommandList>
                    <CommandEmpty>No unattached run scope found.</CommandEmpty>
                    <CommandGroup>
                      {unattachedScopes.map((scope) => (
                        <CommandItem
                          key={scope.id}
                          value={`${scope.name} ${scope.id}`}
                          onSelect={() => {
                            setAttachDialogOpen(false);
                            onAttach(scope.id);
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                          <span className="truncate" title={scope.name}>
                            {scope.name}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={scopeToDetach !== null}
        onOpenChange={(open) => {
          if (!open) setScopeToDetach(null);
        }}
        title="Detach run scope?"
        description={
          scopeToDetach
            ? `The evaluator will stop running on data matched by “${scopeToDetach.name}”.${runScopes.length === 1 ? " Since this is its only run scope, the evaluator will become inactive." : ""}`
            : undefined
        }
        confirmLabel="Detach run scope"
        loading={detachScope.isPending}
        onConfirm={() => {
          if (!scopeToDetach) return;
          detachScope.mutate({
            projectId,
            evaluatorId,
            runScopeId: scopeToDetach.id,
          });
        }}
      />
    </section>
  );
}
