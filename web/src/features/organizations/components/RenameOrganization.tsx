import { Card } from "@tremor/react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import type * as z from "zod";
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
import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";

export default function RenameOrganization() {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const organization = useQueryOrganization();
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizations:update",
  });
  const { update: updateSession } = useSession();

  const orgName = organization?.name;

  const form = useForm<z.infer<typeof projectNameSchema>>({
    resolver: zodResolver(projectNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const renameOrganization = api.organizations.update.useMutation({
    onSuccess: (_) => {
      void updateSession();
      void utils.organizations.invalidate();
    },
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof projectNameSchema>) {
    if (!organization) return;
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

  if (!hasAccess) return null;

  return (
    <div>
      <Header title="Organization Name" level="h3" />
      <Card className="mb-4 p-4">
        {form.getValues().name !== "" ? (
          <p className="mb-4 text-sm text-gray-700">
            Your Organization will be renamed to &quot;
            <b>{form.watch().name}</b>&quot;.
          </p>
        ) : (
          <p
            className="mb-4 text-sm text-gray-700"
            data-testid="organization-name"
          >
            Your Organization is currently named &quot;<b>{orgName}</b>
            &quot;.
          </p>
        )}
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1"
            data-testid="rename-organization-form"
            id="rename-organization-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder={orgName}
                      {...field}
                      className="flex-1"
                      data-testid="new-organization-name-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              variant="secondary"
              type="submit"
              loading={renameOrganization.isLoading}
              disabled={form.getValues().name === ""}
              className="mt-4"
            >
              Save
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
