import React, { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
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
import { Loader2, X, Plus, RefreshCw, Lock, LockOpen } from "lucide-react";
import { type Prisma } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getFormattedPayload } from "@/src/features/experiments/utils/format";
import { WebhookDefaultHeaders } from "@langfuse/shared";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { WebhookSecretRender } from "@/src/features/automations/components/WebhookSecretRender";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

const RemoteExperimentSetupSchema = z.object({
  url: z.url(),
  defaultPayload: z.string(),
  headers: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      isSecret: z.boolean(),
    }),
  ),
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
    displaySecretKey?: string | null;
    displayHeaders?: Record<string, { secret: boolean; value: string }> | null;
  } | null;
  setShowRemoteExperimentUpsertForm: (show: boolean) => void;
}) => {
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });

  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [showDeletePopover, setShowDeletePopover] = useState(false);

  const dataset = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });
  const utils = api.useUtils();

  const existingHeaders = existingRemoteExperiment?.displayHeaders ?? {};
  const initialHeaders = Object.entries(existingHeaders).map(
    ([name, { secret }]) => ({
      name,
      value: "",
      isSecret: secret,
    }),
  );

  const form = useForm<RemoteExperimentSetupForm>({
    resolver: zodResolver(RemoteExperimentSetupSchema),
    defaultValues: {
      url: existingRemoteExperiment?.url || "",
      defaultPayload: getFormattedPayload(existingRemoteExperiment?.payload),
      headers: initialHeaders,
    },
  });

  const {
    fields: headerFields,
    append: appendHeader,
    remove: removeHeader,
  } = useFieldArray({
    control: form.control,
    name: "headers",
  });

  const upsertRemoteExperimentMutation =
    api.datasets.upsertRemoteExperiment.useMutation({
      onSuccess: (data) => {
        if (data.webhookSecret) {
          setWebhookSecret(data.webhookSecret);
          setShowSecretDialog(true);
        } else {
          showSuccessToast({
            title: "Setup successfully",
            description: "Your changes have been saved.",
          });
          setShowRemoteExperimentUpsertForm(false);
        }
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
        utils.datasets.getRemoteExperiment.invalidate({
          projectId,
          datasetId,
        });
        setShowRemoteExperimentUpsertForm(false);
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

    const requestHeaders: Record<string, { secret: boolean; value: string }> =
      {};
    for (const header of data.headers) {
      if (header.name.trim()) {
        requestHeaders[header.name.trim()] = {
          secret: header.isSecret,
          value: header.value.trim(),
        };
      }
    }

    upsertRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
      url: data.url,
      defaultPayload: data.defaultPayload,
      requestHeaders,
    });
  };

  const handleDelete = () => {
    deleteRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
    });
    setShowDeletePopover(false);
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
              <Loader2 className="inline h-4 w-4 animate-spin" />
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

            {/* Headers Section */}
            <div>
              <FormLabel>Headers</FormLabel>

              {/* Default Headers */}
              <div className="mb-4">
                <FormDescription className="mb-2">
                  Default headers (automatically added by Langfuse):
                </FormDescription>
                {Object.entries({
                  ...WebhookDefaultHeaders,
                  "x-langfuse-signature": "t=<timestamp>,v1=<signature>",
                }).map(([key, value]) => (
                  <div
                    key={key}
                    className="mb-2 grid grid-cols-[1fr_1fr] gap-2"
                  >
                    <Input value={key} disabled className="bg-muted/50" />
                    <Input value={value} disabled className="bg-muted/50" />
                  </div>
                ))}
              </div>

              {/* Custom Headers */}
              <FormDescription className="mb-2">
                Optional custom headers to include in the webhook request:
              </FormDescription>

              {headerFields.map((field, index) => {
                const isSecret = form.watch(`headers.${index}.isSecret`);
                return (
                  <div
                    key={field.id}
                    className="mb-2 grid grid-cols-[1fr_1fr_auto_auto] gap-2"
                  >
                    <FormField
                      control={form.control}
                      name={`headers.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Header Name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`headers.${index}.value`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Value"
                              {...field}
                              type={isSecret ? "password" : "text"}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        form.setValue(`headers.${index}.isSecret`, !isSecret)
                      }
                      title={
                        isSecret ? "Make header public" : "Make header secret"
                      }
                    >
                      {isSecret ? (
                        <Lock className="h-4 w-4 text-orange-500" />
                      ) : (
                        <LockOpen className="text-muted-foreground h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeHeader(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  appendHeader({ name: "", value: "", isSecret: false })
                }
                className="mt-2"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Custom Header
              </Button>
            </div>

            {/* Webhook Secret Section */}
            <div>
              <FormLabel>Webhook Secret</FormLabel>
              <FormDescription className="mb-2">
                Use this secret to verify webhook signatures for security. The
                secret is automatically included in the x-langfuse-signature
                header.
              </FormDescription>

              {existingRemoteExperiment?.displaySecretKey ? (
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <CodeView
                        className="bg-muted/50"
                        content={existingRemoteExperiment.displaySecretKey}
                        defaultCollapsed={false}
                      />
                    </div>
                    <div className="flex gap-2">
                      <RegenerateRemoteExperimentSecretButton
                        projectId={projectId}
                        datasetId={datasetId}
                      />
                    </div>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    Secret is encrypted and can only be viewed when generated or
                    regenerated
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 text-muted-foreground rounded-md border p-3 text-sm">
                  Webhook secret will be generated when the trigger is created.
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full justify-between">
              {existingRemoteExperiment && (
                <Popover
                  open={showDeletePopover}
                  onOpenChange={setShowDeletePopover}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleteRemoteExperimentMutation.isPending}
                    >
                      {deleteRemoteExperimentMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Delete
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <h2 className="text-md mb-3 font-semibold">
                      Please confirm
                    </h2>
                    <p className="mb-3 max-w-sm text-sm">
                      Are you sure you want to delete this remote dataset run
                      trigger? This action will remove the configured webhook
                      URL, secret, and custom headers.
                    </p>
                    <div className="flex justify-end space-x-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowDeletePopover(false)}
                        disabled={deleteRemoteExperimentMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        loading={deleteRemoteExperimentMutation.isPending}
                        onClick={handleDelete}
                      >
                        Delete
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Button
                type="submit"
                disabled={upsertRemoteExperimentMutation.isPending}
              >
                {upsertRemoteExperimentMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {existingRemoteExperiment ? "Update" : "Set up"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </Form>

      {/* Webhook Secret Dialog - shown on first creation */}
      <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Webhook Secret Created</DialogTitle>
            <DialogDescription>
              Your webhook secret has been created. Please copy the secret below
              - it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {webhookSecret && (
              <WebhookSecretRender
                webhookSecret={webhookSecret}
                description="This secret can only be viewed once. You can regenerate it in the remote dataset run trigger settings if needed. Use this secret to verify webhook signatures in your endpoint."
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowSecretDialog(false);
                setWebhookSecret(null);
                setShowRemoteExperimentUpsertForm(false);
              }}
            >
              {"I've saved the secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const RegenerateRemoteExperimentSecretButton = ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const [showConfirmPopover, setShowConfirmPopover] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(
    null,
  );

  const utils = api.useUtils();
  const regenerateSecretMutation =
    api.datasets.regenerateRemoteExperimentSecret.useMutation({
      onSuccess: (data) => {
        showSuccessToast({
          title: "Webhook Secret Regenerated",
          description: "Your webhook secret has been successfully regenerated.",
        });
        setRegeneratedSecret(data.webhookSecret);
        setShowRegenerateDialog(true);
        utils.datasets.getRemoteExperiment.invalidate({
          projectId,
          datasetId,
        });
      },
      onError: (error) => {
        showErrorToast(
          error.message || "Failed to regenerate webhook secret",
          "Please try again.",
        );
      },
    });

  const handleRegenerateSecret = async () => {
    try {
      await regenerateSecretMutation.mutateAsync({
        projectId,
        datasetId,
      });
      setShowConfirmPopover(false);
    } catch {
      // Error handled by onError callback
    }
  };

  return (
    <>
      <Popover open={showConfirmPopover} onOpenChange={setShowConfirmPopover}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={regenerateSecretMutation.isPending}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${regenerateSecretMutation.isPending ? "animate-spin" : ""}`}
            />
            Regenerate
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
          <p className="mb-3 max-w-sm text-sm">
            This action will invalidate the current webhook secret and generate
            a new one. Any existing integrations using the old secret will stop
            working until updated.
          </p>
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmPopover(false)}
              disabled={regenerateSecretMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={regenerateSecretMutation.isPending}
              onClick={handleRegenerateSecret}
            >
              Regenerate Secret
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Webhook Secret Regenerated</DialogTitle>
            <DialogDescription>
              Your webhook secret has been regenerated. Please copy the new
              secret below - it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {regeneratedSecret && (
              <WebhookSecretRender
                webhookSecret={regeneratedSecret}
                description="This secret can only be viewed once. You can regenerate it in the remote dataset run trigger settings if needed. Use this secret to verify webhook signatures in your endpoint."
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowRegenerateDialog(false);
                setRegeneratedSecret(null);
              }}
            >
              {"I've saved the secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
