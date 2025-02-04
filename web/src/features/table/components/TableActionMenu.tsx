import { ActionButton } from "@/src/components/ActionButton";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  DropdownMenuContent,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/src/components/ui/select";
import { useSession } from "next-auth/react";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Trash, Plus } from "lucide-react";
import { z } from "zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { getActionConfig } from "@/src/features/table/getActionConfig";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  type SelectAllTableName,
  type ActionId,
  type OrderByState,
} from "@langfuse/shared";
import {
  type TableAction,
  type TableActionQueryConfig,
} from "@/src/features/table/types";
import { useTableActionMutations } from "@/src/features/table/hooks/useTableActionMutations";
import { queryHooks } from "@/src/features/table/components/queryHooks";
import { api } from "@/src/utils/api";

type TableActionMenuProps = {
  projectId: string;
  tableName: SelectAllTableName;
  actionIds: ActionId[];
  orderByState: OrderByState;
  filterState: any;
  selectedIds: string[];
  onActionComplete?: () => void;
};

type TableMenuConfirmButton = {
  projectId: string;
  scope: ProjectScope;
  entitlement?: Entitlement;
  confirmAction?: () => void;
  loading?: boolean;
  disabled?: boolean;
} & Pick<ButtonProps, "variant" | "type">;

function TableMenuConfirmButton(props: TableMenuConfirmButton) {
  // workaround to not call hook conditionally
  const hasEntitlement = useHasEntitlement(
    props.entitlement ?? "trace-deletion",
  );
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: props.scope,
  });

  return (
    <ActionButton
      type={props.type}
      variant={props.variant}
      onClick={() => props.confirmAction?.()}
      hasAccess={hasAccess}
      hasEntitlement={props.entitlement ? hasEntitlement : true}
      loading={props.loading}
      disabled={props.disabled}
    >
      Confirm
    </ActionButton>
  );
}

function TableActionTargetOptions({
  projectId,
  queryConfig,
}: {
  projectId: string;
  queryConfig: TableActionQueryConfig;
}) {
  const session = useSession();
  const hasEntitlement = useHasEntitlement(queryConfig.entitlement);

  const useTargetOptionsQuery = queryHooks[queryConfig.targetQueryRoute];
  const targetOptions = useTargetOptionsQuery(
    { projectId },
    { enabled: session.status === "authenticated" && hasEntitlement },
  );

  return targetOptions.data?.map((option: { id: string; name: string }) => (
    <SelectItem key={option.id} value={option.id}>
      {option.name}
    </SelectItem>
  ));
}

export function TableActionMenu({
  projectId,
  tableName,
  actionIds,
  onActionComplete,
  orderByState,
  filterState,
  selectedIds,
}: TableActionMenuProps) {
  const { selectAll, setSelectAll } = useSelectAll(projectId, tableName);
  const [selectedAction, setSelectedAction] = useState<TableAction | null>(
    null,
  );

  const [isDialogOpen, setDialogOpen] = useState(false);
  const actions = useMemo(
    () =>
      actionIds.reduce(
        (acc, actionId) => acc.set(actionId, getActionConfig(actionId)),
        new Map(),
      ),
    [actionIds],
  );
  const { selectAllMutation, actionMutations } = useTableActionMutations(
    actionIds,
    projectId,
  );

  const isSelectAllInProgress = api.table.getIsSelectAllInProgress.useQuery({
    projectId,
  });

  const handleAction = (actionId: ActionId) => {
    setSelectedAction(actions.get(actionId));
    setDialogOpen(true);
  };

  const handleActionConfirm = async () => {
    if (!selectedAction) return;
    setDialogOpen(false);
    if (selectAll) {
      await selectAllMutation.mutateAsync({
        actionId: selectedAction.id,
        projectId,
        tableName,
        query: {
          filter: filterState,
          orderBy: orderByState,
        },
        targetId: form.getValues().targetId,
      });
    } else {
      const baseParams = {
        projectId,
        itemIds: selectedIds,
      };

      const data =
        selectedAction.type === "create"
          ? selectedAction.translateToMutationInput({
              ...baseParams,
              targetId: form.getValues().targetId,
            })
          : selectedAction.translateToMutationInput(baseParams);

      await actionMutations[selectedAction.id].mutateAsync(data);
    }
    setSelectAll(false);
    onActionComplete?.();
  };

  const form = useForm({
    resolver: zodResolver(z.object({ targetId: z.string() })),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Actions
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {actionIds.map((actionId) => {
            const actionConfig = actions.get(actionId);
            return (
              <DropdownMenuItem
                key={actionId}
                onClick={() => handleAction(actionId)}
              >
                {actionConfig?.type === "delete" ? (
                  <>
                    <Trash className="mr-2 h-4 w-4" />
                    <span>Delete</span>
                  </>
                ) : (
                  <>
                    {actionConfig?.icon || <Plus className="mr-2 h-4 w-4" />}
                    <span>Add to {actionConfig?.queryConfig?.targetLabel}</span>
                  </>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {isDialogOpen && selectedAction?.type === "delete" && (
        <Dialog
          open={isDialogOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDialogOpen(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                This action cannot be undone and removes all the data associated
                with these items.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-start">
              <TableMenuConfirmButton
                projectId={projectId}
                variant="destructive"
                confirmAction={handleActionConfirm}
                scope={selectedAction?.accessCheck?.scope}
                entitlement={selectedAction?.accessCheck?.entitlement}
                loading={isSelectAllInProgress.isLoading}
                disabled={isSelectAllInProgress.data}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isDialogOpen && selectedAction?.type === "create" && (
        <Dialog
          open={isDialogOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setDialogOpen(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <Form {...form}>
              <form
                className="space-y-6"
                onSubmit={form.handleSubmit(
                  async () => await handleActionConfirm(),
                )}
              >
                <DialogHeader>
                  <DialogTitle>
                    Add to {selectedAction?.queryConfig?.targetLabel}
                  </DialogTitle>
                  <DialogDescription>
                    Select a {selectedAction?.queryConfig?.targetLabel} to add
                    the selected items to.
                  </DialogDescription>
                </DialogHeader>
                <FormField
                  control={form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                        </FormControl>

                        <SelectContent>
                          <TableActionTargetOptions
                            projectId={projectId}
                            queryConfig={selectedAction?.queryConfig}
                          />
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="sm:justify-start">
                  <TableMenuConfirmButton
                    type="submit"
                    projectId={projectId}
                    scope={selectedAction?.accessCheck?.scope}
                    entitlement={selectedAction?.accessCheck?.entitlement}
                    loading={isSelectAllInProgress.isLoading}
                    disabled={isSelectAllInProgress.data}
                  />
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
