import { PostHogLogo } from "@/src/components/PosthogLogo";
import Header from "@/src/components/layouts/header";
import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Button } from "@/src/components/ui/button";
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
import { PasswordInput } from "@/src/components/ui/password-input";
import { Switch } from "@/src/components/ui/switch";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { posthogIntegrationFormSchema } from "@/src/features/posthog-integration/types";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@tremor/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod/v4";

export default function PosthogIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const state = api.posthogIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess,
    },
  );

  const status =
    state.isInitialLoading || !hasAccess
      ? undefined
      : state.data?.enabled
        ? "active"
        : "inactive";

  return (
    <ContainerPage
      headerProps={{
        title: "PostHog Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: <>{status && <StatusBadge type={status} />}</>,
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link href="https://langfuse.com/docs/analytics/posthog">
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="mb-4 text-sm text-primary">
        We have teamed up with{" "}
        <Link href="https://posthog.com" className="underline">
          PostHog
        </Link>{" "}
        (OSS product analytics) to make Langfuse events/metrics available in
        your PostHog dashboards. Upon activation, all historical data from your
        project will be synced. After the initial sync, new data is
        automatically synced every hour to keep your PostHog dashboards up to
        date.
      </p>
      {!hasAccess && (
        <p className="text-sm">
          You current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      )}
      {hasAccess && (
        <>
          <Header title="Configuration" />
          <Card className="p-3">
            <PostHogLogo className="mb-4 w-36 text-foreground" />
            <PostHogIntegrationSettings
              state={state.data}
              projectId={projectId}
              isLoading={state.isLoading}
            />
          </Card>
        </>
      )}
      {state.data?.enabled && (
        <>
          <Header title="Status" className="mt-8" />
          <p className="text-sm text-primary">
            Data synced until:{" "}
            {state.data?.lastSyncAt
              ? new Date(state.data.lastSyncAt).toLocaleString()
              : "Never (pending)"}
          </p>
        </>
      )}
    </ContainerPage>
  );
}

const PostHogIntegrationSettings = ({
  state,
  projectId,
  isLoading,
}: {
  state?: RouterOutput["posthogIntegration"]["get"];
  projectId: string;
  isLoading: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const posthogForm = useForm({
    resolver: zodResolver(posthogIntegrationFormSchema),
    defaultValues: {
      posthogHostname: state?.posthogHostName ?? "",
      posthogProjectApiKey: state?.posthogApiKey ?? "",
      enabled: state?.enabled ?? false,
    },
    disabled: isLoading,
  });

  useEffect(() => {
    posthogForm.reset({
      posthogHostname: state?.posthogHostName ?? "",
      posthogProjectApiKey: state?.posthogApiKey ?? "",
      enabled: state?.enabled ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const utils = api.useUtils();
  const mut = api.posthogIntegration.update.useMutation({
    onSuccess: () => {
      utils.posthogIntegration.invalidate();
    },
  });
  const mutDelete = api.posthogIntegration.delete.useMutation({
    onSuccess: () => {
      utils.posthogIntegration.invalidate();
    },
  });

  async function onSubmit(
    values: z.infer<typeof posthogIntegrationFormSchema>,
  ) {
    capture("integrations:posthog_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  return (
    <Form {...posthogForm}>
      <form
        className="space-y-3"
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={posthogForm.handleSubmit(onSubmit)}
      >
        <FormField
          control={posthogForm.control}
          name="posthogHostname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Posthog Hostname</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                US region: https://us.posthog.com; EU region:
                https://eu.posthog.com
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={posthogForm.control}
          name="posthogProjectApiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Posthog Project API Key</FormLabel>
              <FormControl>
                <PasswordInput {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={posthogForm.control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enabled</FormLabel>
              <FormControl>
                <Switch
                  id="posthog-integration-enabled"
                  checked={field.value}
                  onCheckedChange={() => {
                    field.onChange(!field.value);
                  }}
                  className="ml-4 mt-1"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
      <div className="mt-8 flex gap-2">
        <Button
          loading={mut.isLoading}
          onClick={posthogForm.handleSubmit(onSubmit)}
          disabled={isLoading}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isLoading}
          disabled={isLoading || !!!state}
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to reset the PostHog integration for this project?",
              )
            )
              mutDelete.mutate({ projectId });
          }}
        >
          Reset
        </Button>
      </div>
    </Form>
  );
};
