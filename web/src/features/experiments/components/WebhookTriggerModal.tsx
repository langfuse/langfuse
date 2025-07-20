import React from "react";
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
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { Loader2 } from "lucide-react";

const WebhookTriggerSchema = z.object({
  payload: z.string(),
});

type WebhookTriggerForm = z.infer<typeof WebhookTriggerSchema>;

export const WebhookTriggerModal = ({
  projectId,
  datasetId,
  setShowTriggerModal,
}: {
  projectId: string;
  datasetId: string;
  setShowTriggerModal: (show: boolean) => void;
}) => {
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  const dataset = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });

  const webhook = api.datasets.getWebhook.useQuery({
    projectId,
    datasetId,
  });

  const form = useForm<WebhookTriggerForm>({
    resolver: zodResolver(WebhookTriggerSchema),
    defaultValues: {
      payload: webhook.data?.payload
        ? JSON.stringify(webhook.data.payload, null, 2)
        : "{}",
    },
  });

  // Update form when webhook data loads
  React.useEffect(() => {
    if (webhook.data?.payload) {
      form.setValue("payload", JSON.stringify(webhook.data.payload, null, 2));
    }
  }, [webhook.data?.payload, form]);

  const runWebhookMutation = api.datasets.triggerWebhook.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        showSuccessToast({
          title: "Experiment started",
          description: "Your experiment may take a few minutes to complete.",
        });
      } else {
        showErrorToast(
          "Failed to start experiment",
          "Please try again or check your webhook configuration.",
        );
      }
      setShowTriggerModal(false);
    },
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to start experiment",
        "Please try again or check your webhook configuration.",
      );
    },
  });

  const onSubmit = (data: WebhookTriggerForm) => {
    if (data.payload.trim()) {
      try {
        JSON.parse(data.payload);
      } catch (error) {
        form.setError("payload", {
          message: "Invalid JSON format",
        });
        return;
      }
    }

    runWebhookMutation.mutate({
      projectId,
      datasetId,
      payload: data.payload,
    });
  };

  if (!hasDatasetAccess) {
    return null;
  }

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => setShowTriggerModal(false)}
          className="inline-block self-start"
        >
          ← Back
        </Button>
        <DialogTitle>Run Webhook Experiment</DialogTitle>
        <DialogDescription>
          Trigger a webhook experiment for dataset{" "}
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
            <div className="space-y-4">
              <div className="text-sm">
                <span className="font-medium">Webhook URL: </span>
                <code className="rounded bg-muted px-2 py-1 text-muted-foreground">
                  {webhook.data?.url || "Loading..."}
                </code>
              </div>

              <FormField
                control={form.control}
                name="payload"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payload</FormLabel>
                    <FormDescription>
                      JSON payload that will be sent to the webhook URL along
                      with the dataset information.
                    </FormDescription>
                    <FormControl>
                      <CodeMirrorEditor
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        editable
                        mode="json"
                        minHeight={200}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTriggerModal(false)}
                disabled={runWebhookMutation.isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={runWebhookMutation.isLoading}>
                {runWebhookMutation.isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Run Experiment
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
