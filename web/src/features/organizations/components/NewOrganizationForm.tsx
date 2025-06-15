import { Button } from "@/src/components/ui/button";
import type * as z from "zod/v4";
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
  onSuccess: (orgId: string) => void;
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
      .then((org) => {
        void updateSession();
        onSuccess(org.id);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        data-testid="new-org-form"
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
        <Button type="submit" loading={createOrgMutation.isLoading}>
          Create
        </Button>
      </form>
    </Form>
  );
};
