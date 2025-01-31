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
} from "@/src/components/ui/select";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Trash, Plus } from "lucide-react";
import { z } from "zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { getActionConfig } from "@/src/features/table/getActionConfig";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { type Entitlement } from "@/src/features/entitlements/constants/entitlements";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

type TableActionMenuProps = {
  projectId: string;
  tableName: string;
  actionIds: string[];
  onActionComplete?: () => void;
};

type TableMenuConfirmButton = {
  projectId: string;
  scope: ProjectScope;
  entitlement: Entitlement;
  confirmAction: () => void;
} & Pick<ButtonProps, "variant" | "type">;

function TableMenuConfirmButton(props: TableMenuConfirmButton) {
  const hasEntitlement = useHasEntitlement(props.entitlement);
  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: props.scope,
  });

  return (
    <ActionButton
      type={props.type}
      variant={props.variant}
      onClick={() => props.confirmAction()}
      hasEntitlement={hasEntitlement}
      hasAccess={hasAccess}
    >
      Confirm
    </ActionButton>
  );
}

export function TableActionMenu({
  projectId,
  tableName,
  actionIds,
  onActionComplete,
}: TableActionMenuProps) {
  const { selectAll } = useSelectAll(projectId, tableName);
  const [selectedActionId, setSelectedActionId] = useState<string>("");
  const [isDialogOpen, setDialogOpen] = useState(false);
  const actions = actionIds.reduce(
    (acc, actionId) => acc.set(actionId, getActionConfig(actionId)),
    new Map(),
  );
  const selectedActionProps = actions.get(selectedActionId);

  const handleAction = (actionId: string) => {
    setSelectedActionId(actionId);
    setDialogOpen(true);
  };

  const confirmAction = () => {
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
                    <span>
                      Add to {actionConfig?.createConfig?.targetLabel}
                    </span>
                  </>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {isDialogOpen && selectedActionProps?.type === "delete" && (
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
                variant="destructive"
                confirmAction={confirmAction}
                {...selectedActionProps}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isDialogOpen && selectedActionProps?.type === "create" && (
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
                onSubmit={form.handleSubmit(() => confirmAction())}
              >
                <DialogHeader>
                  <DialogTitle>
                    Add to {selectedActionProps?.createConfig?.targetLabel}
                  </DialogTitle>
                  <DialogDescription>
                    Select a {selectedActionProps?.createConfig?.targetLabel} to
                    add the selected items to.
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
                          {/* {selectedActionProps?.createConfig
                            ?.getTargetOptions(projectId)
                            .map((target) => (
                              <SelectItem key={target.id} value={target.id}>
                                {target.name}
                              </SelectItem>
                            ))} */}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="sm:justify-start">
                  <TableMenuConfirmButton
                    type="submit"
                    confirmAction={confirmAction}
                    {...selectedActionProps}
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
