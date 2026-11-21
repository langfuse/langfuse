import { zodResolver } from "@hookform/resolvers/zod";
import { useId, type ReactNode } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import * as z from "zod";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";

const ORGANIZATION_DELETION_DOCS_URL =
  "https://langfuse.com/docs/administration/data-deletion#deleting-an-organization";

const PROJECTS_STILL_DELETING_MESSAGE =
  "Your projects are still being deleted. You can delete the organization once that finishes.";

export type DeleteOrganizationDialogStatus =
  | "loading"
  | "has-projects"
  | "projects-deleting"
  | "check-failed"
  | "confirm";

export type DeleteOrganizationDialogProps = {
  confirmMessage: string;
  /** Disables the confirm button. Shown as a hover tooltip. */
  deleteDisabledReason?: string;
  inlineError?: string;
  isSubmitting: boolean;
  onConfirm: () => void | Promise<void>;
  status: DeleteOrganizationDialogStatus;
};

export function DeleteOrganizationDialog({
  confirmMessage,
  deleteDisabledReason,
  inlineError,
  isSubmitting,
  onConfirm,
  status,
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
    if (status !== "confirm" || deleteDisabledReason) return;
    return onConfirm();
  };

  const deleteDisabled = status !== "confirm" || Boolean(deleteDisabledReason);
  const body = deleteOrganizationDialogBody({
    confirmMessage,
    form,
    formId,
    inlineError,
    onSubmit,
    status,
  });

  return (
    <Dialog
      title="Delete Organization"
      actions={[
        {
          label: "Delete Organization",
          type: "submit",
          form: formId,
          variant: "destructive",
          loading: isSubmitting,
          disabled: deleteDisabled,
          disabledReason: deleteDisabledReason,
        },
      ]}
    >
      {body}
    </Dialog>
  );
}

function deleteOrganizationDialogBody({
  confirmMessage,
  form,
  formId,
  inlineError,
  onSubmit,
  status,
}: {
  confirmMessage: string;
  form: UseFormReturn<{ name: string }>;
  formId: string;
  inlineError: string | undefined;
  onSubmit: () => void | Promise<void>;
  status: DeleteOrganizationDialogStatus;
}): ReactNode {
  if (status === "loading") {
    return (
      <Dialog.Body>
        <div className="flex items-center gap-2" role="status">
          <Spinner size="sm" />
          <p>Checking whether projects are still being deleted.</p>
        </div>
      </Dialog.Body>
    );
  }

  if (status === "projects-deleting") {
    return (
      <Dialog.Body>
        <p>{PROJECTS_STILL_DELETING_MESSAGE}</p>
        <p>
          <TextLink
            path={ORGANIZATION_DELETION_DOCS_URL}
            value="Deleting an organization"
            external
          />
        </p>
      </Dialog.Body>
    );
  }

  if (status === "check-failed") {
    return (
      <Dialog.Body>
        <p>
          {inlineError ??
            "Couldn't check whether projects are still being deleted. Try again in a moment."}
        </p>
      </Dialog.Body>
    );
  }

  if (status === "has-projects") {
    return (
      <Dialog.Body>
        <p>
          You can only delete an organization if it has no projects associated
          with it. Please delete or transfer all projects first. Project
          deletion is queued and can take a while for large projects.
        </p>
      </Dialog.Body>
    );
  }

  return (
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
          {inlineError ? (
            <p className="text-destructive">{inlineError}</p>
          ) : null}
        </Dialog.Body>
      </form>
    </Form>
  );
}
