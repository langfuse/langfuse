import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useForm } from "react-hook-form";

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
import { Input } from "@/src/components/ui/input";

export interface DeleteOrganizationDialogContentProps {
  confirmMessage: string;
  hasProjects: boolean;
  isPending: boolean;
  onConfirm: () => void | Promise<void>;
}

export function DeleteOrganizationDialogContent({
  confirmMessage,
  hasProjects,
  isPending,
  onConfirm,
}: DeleteOrganizationDialogContentProps) {
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
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold">
          Delete Organization
        </DialogTitle>
        <DialogDescription>
          {hasProjects
            ? "You can only delete an organization if it has no projects associated with it. Please delete or transfer all projects first. Deleting projects may take a few minutes."
            : `To confirm, type "${confirmMessage}" in the input box `}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {!hasProjects && (
            <DialogBody>
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
            </DialogBody>
          )}
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              loading={isPending}
              disabled={hasProjects}
              className="w-full"
            >
              Delete Organization
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
