import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslations } from "next-intl";

type TransferProjectDialogOrganization = {
  id: string;
  name: string;
};

export interface TransferProjectDialogContentProps {
  projectName: string;
  organizationName: string;
  organizations: TransferProjectDialogOrganization[];
  isPending: boolean;
  onConfirm: (organizationId: string) => void;
}

export function TransferProjectDialogContent({
  projectName,
  organizationName,
  organizations,
  isPending,
  onConfirm,
}: TransferProjectDialogContentProps) {
  const t = useTranslations("workspace.dangerActions");
  const confirmMessage = `${organizationName}/${projectName}`
    .replaceAll(" ", "-")
    .toLowerCase();
  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: t("confirmValidation", { value: confirmMessage }),
    }),
    organizationId: z.string(),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      organizationId: "",
    },
  });

  return (
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{t("transferProjectTitle")}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(({ organizationId }) =>
            onConfirm(organizationId),
          )}
          className="flex flex-col gap-8"
        >
          <DialogBody>
            <Alert variant="warning" icon={TriangleAlert}>
              <Alert.Title>{t("warning")}</Alert.Title>
              <Alert.Description>
                {t("transferWarningIntro")}
                <ul className="list-disc pl-4">
                  <li>{t("transferWarningAccess")}</li>
                  <li>{t("transferWarningOperation")}</li>
                </ul>
              </Alert.Description>
            </Alert>
            <FormField
              control={form.control}
              name="organizationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("selectNewOrganization")}</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectOrganization")} />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((organization) => (
                          <SelectItem
                            key={organization.id}
                            value={organization.id}
                          >
                            {organization.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>{t("transferDescription")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("confirm")}</FormLabel>
                  <FormControl>
                    <Input placeholder={confirmMessage} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t("confirmInstruction", { value: confirmMessage })}
                  </FormDescription>
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
              {t("transferProjectButton")}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
