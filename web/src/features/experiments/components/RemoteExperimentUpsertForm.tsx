import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { type Prisma } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getFormattedPayload } from "@/src/features/experiments/utils/format";
import Spinner from "@/src/components/design-system/Spinner/Spinner";

const RemoteExperimentSetupSchema = z.object({
  url: z.url(),
  defaultPayload: z.string(),
  enabled: z.boolean(),
});

type RemoteExperimentSetupForm = z.infer<typeof RemoteExperimentSetupSchema>;

export const RemoteExperimentUpsertForm = ({
  projectId,
  datasetId,
  existingRemoteExperiment,
  setShowRemoteExperimentUpsertForm,
}: {
  projectId: string;
  datasetId: string;
  existingRemoteExperiment?: {
    url: string;
    payload: Prisma.JsonValue;
    enabled?: boolean;
  } | null;
  setShowRemoteExperimentUpsertForm: (show: boolean) => void;
}) => {
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  const dataset = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });
  const utils = api.useUtils();

  const form = useForm<RemoteExperimentSetupForm>({
    resolver: zodResolver(RemoteExperimentSetupSchema),
    defaultValues: {
      url: existingRemoteExperiment?.url || "",
      defaultPayload: getFormattedPayload(existingRemoteExperiment?.payload),
      enabled: existingRemoteExperiment?.enabled ?? true,
    },
  });

  const upsertRemoteExperimentMutation =
    api.datasets.upsertRemoteExperiment.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Setup successfully",
          description: "Your changes have been saved.",
        });
        setShowRemoteExperimentUpsertForm(false);
        utils.datasets.getRemoteExperiment.invalidate({
          projectId,
          datasetId,
        });
      },
      onError: (error) => {
        showErrorToast(
          error.message || "Failed to setup",
          "Please check your URL and config and try again.",
        );
      },
    });

  const deleteRemoteExperimentMutation =
    api.datasets.deleteRemoteExperiment.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Deleted successfully",
          description:
            "The remote dataset run trigger has been removed from this dataset.",
        });
        setShowRemoteExperimentUpsertForm(false);
        utils.datasets.getRemoteExperiment.invalidate({
          projectId,
          datasetId,
        });
      },
      onError: (error) => {
        showErrorToast(
          error.message || "Failed to delete remote dataset run trigger",
          "Please try again.",
        );
      },
    });

  const onSubmit = (data: RemoteExperimentSetupForm) => {
    if (data.defaultPayload.trim()) {
      try {
        JSON.parse(data.defaultPayload);
      } catch {
        form.setError("defaultPayload", {
          message: "Invalid JSON format",
        });
        return;
      }
    }

    upsertRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
      url: data.url,
      defaultPayload: data.defaultPayload,
      enabled: data.enabled,
    });
  };

  const handleDelete = () => {
    if (
      confirm(
        "Are you sure you want to delete this remote dataset run trigger?",
      )
    ) {
      deleteRemoteExperimentMutation.mutate({
        projectId,
        datasetId,
      });
    }
  };

  if (!hasDatasetAccess) {
    return null;
  }

  if (dataset.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => setShowRemoteExperimentUpsertForm(false)}
          className="inline-block self-start"
        >
          ← Back
        </Button>
        <DialogTitle>
          {existingRemoteExperiment
            ? "Edit remote dataset run trigger"
            : "Set up remote dataset run trigger in UI"}
        </DialogTitle>
        <DialogDescription>
          Enable your team to run custom dataset runs on dataset{" "}
          <strong>
            {dataset.isSuccess ? (
              <>&quot;{dataset.data?.name}&quot;</>
            ) : (
              <Spinner size="sm" display="inline" />
            )}
          </strong>
          . Configure a webhook URL to trigger remote custom dataset runs from
          UI. We will send dataset info (name, id) and config to your service,
          which can run against the dataset and post results to Langfuse.
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DialogBody>
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL</FormLabel>
                  <FormDescription>
                    The URL that will be called when the remote dataset run is
                    triggered.
                  </FormDescription>
                  <FormControl>
                    <Input
                      placeholder="https://your-service.com/webhook"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="defaultPayload"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default config</FormLabel>
                  <FormDescription>
                    Set a default config that will be sent to the remote dataset
                    run URL. This can be modified before starting a new run.
                    View docs for more details.
                  </FormDescription>
                  <CodeMirrorEditor
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    editable
                    mode="json"
                    minHeight={200}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Enabled</FormLabel>
                    <FormDescription>
                      {field.value
                        ? "Trigger is active. You can disable anytime to pause without losing your configuration."
                        : "Trigger is paused. Enable to allow running remote experiments."}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full justify-between">
              {existingRemoteExperiment && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteRemoteExperimentMutation.isPending}
                >
                  {deleteRemoteExperimentMutation.isPending && (
                    <div className="mr-2">
                      <Spinner size="sm" />
                    </div>
                  )}
                  Delete
                </Button>
              )}
              <Button
                type="submit"
                disabled={upsertRemoteExperimentMutation.isPending}
              >
                {upsertRemoteExperimentMutation.isPending ? (
                  <div className="mr-2">
                    <Spinner size="sm" />
                  </div>
                ) : null}
                {existingRemoteExperiment ? "Update" : "Set up"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
