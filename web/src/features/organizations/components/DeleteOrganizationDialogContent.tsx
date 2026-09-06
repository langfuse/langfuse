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
import { useTranslations } from "next-intl";

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
  const t = useTranslations("workspace.dangerActions");
  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: t("confirmValidation", { value: confirmMessage }),
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
          {t("deleteOrganizationTitle")}
        </DialogTitle>
        <DialogDescription>
          {hasProjects
            ? t("deleteOrganizationBlocked")
            : t("confirmInstruction", { value: confirmMessage })}
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
              {t("deleteOrganizationButton")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
