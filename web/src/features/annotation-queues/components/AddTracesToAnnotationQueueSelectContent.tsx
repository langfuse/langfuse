import { ActionButton } from "@/src/components/ActionButton";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Plus } from "lucide-react";
import { type UseFormReturn } from "react-hook-form";

export type AnnotationQueueSelectOption = {
  id: string;
  name: string;
};

type SelectFormValues = {
  targetId: string;
};

export type AddTracesToAnnotationQueueSelectContentProps = {
  description: string;
  form: UseFormReturn<SelectFormValues>;
  queueOptions: AnnotationQueueSelectOption[];
  isQueueOptionsLoading: boolean;
  onSubmit: () => void;
  onCreateNewQueue: () => void;
  canCreateQueue: boolean;
  createQueueDisabledReason?: string;
  hasAccess: boolean;
  isBatchActionInProgress: boolean;
  isConfirmLoading: boolean;
  isConfirmDisabled: boolean;
};

export function AddTracesToAnnotationQueueSelectContent({
  description,
  form,
  queueOptions,
  isQueueOptionsLoading,
  onSubmit,
  onCreateNewQueue,
  canCreateQueue,
  createQueueDisabledReason,
  hasAccess,
  isBatchActionInProgress,
  isConfirmLoading,
  isConfirmDisabled,
}: AddTracesToAnnotationQueueSelectContentProps) {
  return (
    <>
      <DialogHeader variant="action">
        <DialogTitle>Add to Annotation Queue</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          <DialogBody>
            <DialogDescription>{description}</DialogDescription>
            <FormField
              control={form.control}
              name="targetId"
              render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isQueueOptionsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isQueueOptionsLoading ? "Loading..." : "Select..."
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {queueOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              disabled={!canCreateQueue}
              title={createQueueDisabledReason}
              onClick={onCreateNewQueue}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create new queue
            </Button>
          </DialogBody>
          <DialogFooter variant="action">
            {isBatchActionInProgress ? (
              <div className="flex items-center gap-1">
                <Spinner size="xxs" />
                <p className="text-muted-foreground text-sm">
                  Batch action is in progress, please wait.
                </p>
              </div>
            ) : null}
            <ActionButton
              type="submit"
              hasAccess={hasAccess}
              loading={isConfirmLoading}
              disabled={isConfirmDisabled}
            >
              Confirm
            </ActionButton>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
