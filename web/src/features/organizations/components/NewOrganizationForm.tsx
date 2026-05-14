import { Button } from "@/src/components/ui/button";
import type * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const NewOrganizationForm = ({
  onSuccess,
}: {
  onSuccess: (orgId: string) => void | Promise<void>;
}) => {
  const { update: updateSession } = useSession();

  const form = useForm({
    resolver: zodResolver(organizationNameSchema),
    defaultValues: {
      name: "",
    },
  });
  const capture = usePostHogClientCapture();
  const createOrgMutation = api.organizations.create.useMutation({
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof organizationNameSchema>) {
    capture("organizations:new_form_submit");
    createOrgMutation
      .mutateAsync({
        name: values.name,
      })
      .then(async (org) => {
        // the setup (next step) resolves the current org from session state,
        // so we refresh it, so that the UI doesn't render stale state.
        // for example, it could otherwise show the v4 enable toggle.
        await updateSession();
        await onSuccess(org.id);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        data-testid="new-org-form"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void form.handleSubmit(onSubmit)();
          }
        }}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization name</FormLabel>
              <FormControl>
                <Input
                  placeholder="my-org"
                  {...field}
                  data-testid="new-org-name-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={createOrgMutation.isPending}>
          Create
        </Button>
      </form>
    </Form>
  );
};
