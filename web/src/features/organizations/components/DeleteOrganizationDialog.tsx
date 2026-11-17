import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";

export type DeleteOrganizationDialogProps = {
  confirmMessage: string;
  hasProjects: boolean;
  isPending: boolean;
  onConfirm: () => void | Promise<void>;
};

export function DeleteOrganizationDialog({
  confirmMessage,
  hasProjects,
  isPending,
  onConfirm,
}: DeleteOrganizationDialogProps) {
  const formId = useId();
  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: `Please confirm with "${confirmMessage}"`,
    }),
  });
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const onSubmit = () => {
    if (hasProjects) return;
    return onConfirm();
  };

  return (
    <Dialog
      title="Delete Organization"
      actions={[
        {
          label: "Delete Organization",
          type: "submit",
          form: formId,
          variant: "destructive",
          loading: isPending,
          disabled: hasProjects,
        },
      ]}
    >
      {hasProjects ? (
        <Dialog.Body>
          <p>
            You can only delete an organization if it has no projects associated
            with it. Please delete or transfer all projects first. Deleting
            projects may take a few minutes.
          </p>
        </Dialog.Body>
      ) : (
        <Form {...form}>
          <form id={formId} onSubmit={form.handleSubmit(onSubmit)}>
            <Dialog.Body>
              <p>{`To confirm, type "${confirmMessage}" in the input box`}</p>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder={confirmMessage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Dialog.Body>
          </form>
        </Form>
      )}
    </Dialog>
  );
}
