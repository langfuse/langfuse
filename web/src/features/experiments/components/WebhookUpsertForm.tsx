import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
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
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { Loader2 } from "lucide-react";
import { type Prisma } from "@langfuse/shared";

const WebhookSetupSchema = z.object({
  url: z.string(),
  defaultPayload: z.string(),
});

type WebhookSetupForm = z.infer<typeof WebhookSetupSchema>;

export const WebhookUpsertForm = ({
  projectId,
  datasetId,
  existingWebhook,
  setShowWebhookUpsertForm,
}: {
  projectId: string;
  datasetId: string;
  existingWebhook?: {
    url: string;
    payload: Prisma.JsonValue;
  } | null;
  setShowWebhookUpsertForm: (show: boolean) => void;
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

  const form = useForm<WebhookSetupForm>({
    resolver: zodResolver(WebhookSetupSchema),
    defaultValues: {
      url: existingWebhook?.url || "",
      defaultPayload: existingWebhook?.payload
        ? JSON.stringify(existingWebhook.payload, null, 2)
        : "{}",
    },
  });

  const updateWebhookMutation = api.datasets.upsertWebhook.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Webhook setup successfully",
        description: "Your changes have been saved.",
      });
      setShowWebhookUpsertForm(false);
      utils.datasets.getWebhook.invalidate({
        projectId,
        datasetId,
      });
    },
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to setup webhook",
        "Please check your configuration and try again.",
      );
    },
  });

  const deleteWebhookMutation = api.datasets.deleteWebhook.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Webhook deleted successfully",
        description: "The webhook has been removed from this dataset.",
      });
      setShowWebhookUpsertForm(false);
    },
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to delete webhook",
        "Please try again.",
      );
    },
  });

  const onSubmit = (data: WebhookSetupForm) => {
    if (data.defaultPayload.trim()) {
      try {
        JSON.parse(data.defaultPayload);
      } catch (error) {
        form.setError("defaultPayload", {
          message: "Invalid JSON format",
        });
        return;
      }
    }

    updateWebhookMutation.mutate({
      projectId,
      datasetId,
      url: data.url,
      defaultPayload: data.defaultPayload,
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this webhook?")) {
      deleteWebhookMutation.mutate({
        projectId,
        datasetId,
      });
    }
  };

  if (!hasDatasetAccess) {
    return null;
  }

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => setShowWebhookUpsertForm(false)}
          className="inline-block self-start"
        >
          ← Back
        </Button>
        <DialogTitle>
          {existingWebhook ? "Edit" : "Set up"} Webhook Experiment
        </DialogTitle>
        <DialogDescription>
          Configure a webhook URL to trigger external experiment runners for
          dataset{" "}
          <strong>
            {dataset.isSuccess ? (
              <>
                &quot;<strong>{dataset.data?.name}</strong>&quot;
              </>
            ) : (
              <Loader2 className="inline h-4 w-4 animate-spin" />
            )}
          </strong>
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
                    The URL that will be called when the webhook experiment is
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
                  <FormLabel>Config</FormLabel>
                  <FormDescription>
                    Set a default JSON payload that will be sent to the webhook
                    URL. This can be modified when triggering the experiment.
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
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full justify-between">
              {existingWebhook && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteWebhookMutation.isLoading}
                >
                  {deleteWebhookMutation.isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={updateWebhookMutation.isLoading}>
                {updateWebhookMutation.isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {existingWebhook ? "Update" : "Set up"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
