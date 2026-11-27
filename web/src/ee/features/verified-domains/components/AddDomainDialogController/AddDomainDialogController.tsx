import { useId, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";

const addDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .transform((v) => v.toLowerCase())
    .refine(
      (v) =>
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(
          v,
        ),
      { message: "Must be a valid domain (e.g. acme.com)" },
    ),
});

type AddDomainInput = z.infer<typeof addDomainSchema>;

export function AddDomainDialogController({
  children,
  isSubmitting,
  onSubmitDomain,
}: {
  children: (control: { openDialog: () => void }) => ReactNode;
  isSubmitting: boolean;
  onSubmitDomain: (domain: string) => Promise<void>;
}) {
  return (
    <DialogController<true>
      onBeforeClose={() => !isSubmitting}
      renderDialog={({ closeDialog }) => (
        <AddDomainDialogContent
          closeDialog={closeDialog}
          isSubmitting={isSubmitting}
          onSubmitDomain={onSubmitDomain}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: () => openDialog(true),
        })
      }
    </DialogController>
  );
}

function AddDomainDialogContent({
  closeDialog,
  isSubmitting,
  onSubmitDomain,
}: {
  closeDialog: () => void;
  isSubmitting: boolean;
  onSubmitDomain: (domain: string) => Promise<void>;
}) {
  const formId = useId();

  const form = useForm<AddDomainInput>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: "" },
  });

  async function onSubmit(values: AddDomainInput) {
    try {
      await onSubmitDomain(values.domain);
      form.reset();
      closeDialog();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add domain";
      form.setError("domain", { message });
    }
  }

  return (
    <Dialog
      title="Add a domain"
      actions={[
        {
          label: "Add",
          loading: isSubmitting,
          type: "submit",
          form: formId,
        },
      ]}
    >
      <Dialog.Body>
        <Form {...form}>
          <form
            id={formId}
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain</FormLabel>
                  <FormControl>
                    <Input placeholder="acme.com" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
