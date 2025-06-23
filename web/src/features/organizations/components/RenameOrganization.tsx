import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import type * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { LockIcon } from "lucide-react";
import { useSession } from "next-auth/react";

export default function RenameOrganization() {
  const { update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });

  const orgName =
    organization && "name" in organization ? organization.name : "";

  const form = useForm({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const renameOrganization = api.organizations.update.useMutation({
    onSuccess: () => {
      void updateSession();
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    if (!organization || !hasAccess) return;
    capture("organization_settings:rename_form_submit");
    renameOrganization
      .mutateAsync({
        orgId: organization.id,
        name: values.name,
      })
      .then(() => {
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <div>
      <Header title="Organization Name" />
      <Card className="mb-4 p-3">
        {form.getValues().name !== "" ? (
          <p className="mb-4 text-sm text-primary">
            Your Organization will be renamed from &quot;
            {orgName}
            &quot; to &quot;
            <b>{form.watch().name}</b>&quot;.
          </p>
        ) : (
          <p className="mb-4 text-sm">
            Your Organization is currently named &quot;<b>{orgName}</b>
            &quot;.
          </p>
        )}
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1"
            id="rename-organization-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder={orgName}
                        {...field}
                        className="flex-1"
                        disabled={!hasAccess}
                      />
                      {!hasAccess && (
                        <span title="No access">
                          <LockIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted" />
                        </span>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {hasAccess && (
              <Button
                variant="secondary"
                type="submit"
                loading={renameOrganization.isLoading}
                disabled={form.getValues().name === "" || !hasAccess}
                className="mt-4"
              >
                Save
              </Button>
            )}
          </form>
        </Form>
      </Card>
    </div>
  );
}
