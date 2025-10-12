import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import * as z from "zod/v4";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast"; // Import success toast function
import { env } from "@/src/env.mjs";
import { useTranslation } from "react-i18next";

export function DeleteOrganizationButton() {
  const { t } = useTranslation();
  const capture = usePostHogClientCapture();

  const organization = useQueryOrganization();
  const confirmMessage =
    organization?.name.replaceAll(" ", "-").toLowerCase() ?? "organization";

  const formSchema = z.object({
    name: z.string().includes(confirmMessage, {
      message: t("organization.delete.confirmMessage", { confirmMessage }),
    }),
  });

  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:delete",
  });

  const deleteOrganization = api.organizations.delete.useMutation();
  const hasProjects = !!organization && organization.projects.length > 0;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const onSubmit = async () => {
    if (!organization || hasProjects) return;
    try {
      await deleteOrganization.mutateAsync({
        orgId: organization.id,
      });
      capture("organization_settings:delete_organization");
      showSuccessToast({
        title: t("organization.delete.successTitle"),
        description: t("organization.delete.successDescription"),
      });
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Delay for 5 seconds
      window.location.href = env.NEXT_PUBLIC_BASE_PATH ?? "/"; // Browser reload to refresh jwt
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive-secondary" disabled={!hasAccess}>
          {t("organization.delete.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {t("organization.delete.title")}
          </DialogTitle>
          <DialogDescription>
            {hasProjects
              ? t("organization.delete.descriptionWithProjects")
              : t("organization.delete.description", { confirmMessage })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
          >
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
                loading={deleteOrganization.isPending}
                disabled={hasProjects}
                className="w-full"
              >
                {t("organization.delete.button")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
