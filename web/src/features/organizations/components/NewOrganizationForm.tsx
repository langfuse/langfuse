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
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { organizationFormSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { ExternalLink } from "lucide-react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

export const NewOrganizationForm = ({
  onSuccess,
}: {
  onSuccess: (orgId: string) => void | Promise<void>;
}) => {
  const { update: updateSession } = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  const form = useForm({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: {
      name: "",
      aiFeaturesEnabled: true,
    },
  });
  const capture = usePostHogClientCapture();
  const createOrgMutation = api.organizations.create.useMutation({
    onError: (error) => form.setError("name", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof organizationFormSchema>) {
    capture("organizations:new_form_submit");
    createOrgMutation
      .mutateAsync({
        name: values.name,
        aiFeaturesEnabled: values.aiFeaturesEnabled,
      })
      .then(async (org) => {
        // the setup (next step) resolves the current org from session state,
        // so we refresh it, so that the UI doesn't render stale state.
        // for example, it could otherwise show the v4 enable toggle.
        await updateSession();
        await onSuccess(org.id);
        form.reset();
      })
      .catch((error) => reportTrpcErrorWithoutToast(error, "organizations"));
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
            form.handleSubmit(onSubmit)();
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
        <FormField
          control={form.control}
          name="aiFeaturesEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start justify-between gap-4 rounded-md border p-3">
              <div className="flex flex-col gap-1">
                <FormLabel>Enable AI powered features</FormLabel>
                <p className="text-muted-foreground text-sm">
                  {isLangfuseCloud
                    ? "Relevant project data can be sent to AWS Bedrock within your Langfuse data region. Your data will not be used for training models."
                    : "Relevant project data can be sent to the model provider configured by your instance administrator."}{" "}
                  {isLangfuseCloud && (
                    <a
                      href="https://langfuse.com/security/ai-features"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      Learn more
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Enable AI powered features"
                />
              </FormControl>
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
