import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useForm } from "react-hook-form";
import { type TableAction } from "@/src/features/table/types";
import { TableActionTargetOptions } from "@/src/features/table/components/TableActionTargetOptions";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ActionButton } from "@/src/components/ActionButton";
import { useOptionalEntitlement } from "@/src/features/entitlements/hooks";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { type BatchExportTableName } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Loader2 } from "lucide-react";

type TableActionDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  action: TableAction;
  projectId: string;
  tableName: BatchExportTableName;
};

export function TableActionDialog({
  isOpen,
  onClose,
  action,
  projectId,
  tableName,
}: TableActionDialogProps) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: action.accessCheck.scope,
  });
  const { setSelectAll } = useSelectAll(projectId, tableName);
  const hasEntitlement = useOptionalEntitlement(action.accessCheck.entitlement);
  const form = useForm({ defaultValues: { targetId: "" } });

  const isInProgress = api.table.getIsBatchActionInProgress.useQuery(
    {
      projectId,
      tableName,
      actionId: action.id,
    },
    {
      refetchInterval: 2 * 60 * 1000, // 2 minutes
    },
  );

  const handleConfirm = async () => {
    await action.execute({ projectId, targetId: form.getValues().targetId });
    setSelectAll(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.description}</DialogDescription>
        </DialogHeader>

        {action.type === "create" && (
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit(handleConfirm)}
            >
              <DialogBody>
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
                            action={action}
                            projectId={projectId}
                          />
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogBody>
              <DialogFooter>
                {isInProgress.data && (
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      Batch action is in progress, please wait.
                    </p>
                  </div>
                )}
                <ActionButton
                  type="submit"
                  hasAccess={hasAccess}
                  hasEntitlement={hasEntitlement}
                  loading={isInProgress.isLoading}
                  disabled={isInProgress.data || !form.watch("targetId")}
                >
                  Confirm
                </ActionButton>
              </DialogFooter>
            </form>
          </Form>
        )}

        {action.type === "delete" && (
          <DialogFooter>
            {isInProgress.data && (
              <div className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Batch action is in progress, please wait.
                </p>
              </div>
            )}
            <ActionButton
              variant="destructive"
              hasAccess={hasAccess}
              hasEntitlement={hasEntitlement}
              loading={isInProgress.isLoading}
              disabled={isInProgress.data}
              onClick={handleConfirm}
            >
              Confirm
            </ActionButton>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
