import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
import { useTranslations } from "next-intl";

type DeleteProjectForm = {
  name: string;
};

export type DeleteProjectDialogProps = {
  confirmMessage: string;
  isPending: boolean;
  onSubmit: () => void;
};

export function DeleteProjectDialog({
  confirmMessage,
  isPending,
  onSubmit,
}: DeleteProjectDialogProps) {
  const t = useTranslations("workspace.dangerActions");
  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: t("confirmValidation", { value: confirmMessage }),
    }),
  });

  const form = useForm<DeleteProjectForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold">
          {t("deleteProjectTitle")}
        </DialogTitle>
        <DialogDescription>
          {t("confirmInstruction", { value: confirmMessage })}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
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
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              loading={isPending}
              className="w-full"
            >
              {t("deleteProjectButton")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
