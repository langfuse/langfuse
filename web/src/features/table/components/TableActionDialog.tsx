import {
  Dialog,
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
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { type BatchActionTableName } from "@langfuse/shared";

type TableActionDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  action: TableAction;
  projectId: string;
  tableName: BatchActionTableName;
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
  const hasEntitlement = useHasEntitlement(action.accessCheck.entitlement);
  const form = useForm({ defaultValues: { targetId: "" } });

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
              <DialogFooter>
                <ActionButton
                  type="submit"
                  hasAccess={hasAccess}
                  hasEntitlement={hasEntitlement}
                >
                  Confirm
                </ActionButton>
              </DialogFooter>
            </form>
          </Form>
        )}

        {action.type === "delete" && (
          <DialogFooter>
            <ActionButton
              variant="destructive"
              onClick={handleConfirm}
              hasAccess={hasAccess}
              hasEntitlement={hasEntitlement}
            >
              Confirm
            </ActionButton>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
