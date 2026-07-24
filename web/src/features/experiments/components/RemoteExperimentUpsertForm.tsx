import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, LockOpen, Plus, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
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
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { CodeMirrorEditor } from "@/src/components/editor/CodeMirrorEditor";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { type Prisma } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getFormattedPayload } from "@/src/features/experiments/utils/format";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { REMOTE_EXPERIMENT_PROTECTED_HEADERS } from "@/src/features/datasets/remoteExperimentConstants";

const RemoteExperimentSetupSchema = z.object({
  url: z.url(),
  defaultPayload: z.string(),
  enabled: z.boolean(),
  signingEnabled: z.boolean(),
  headers: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      isSecret: z.boolean(),
      displayValue: z.string().optional(),
    }),
  ),
});

type RemoteExperimentSetupForm = z.infer<typeof RemoteExperimentSetupSchema>;

export const RemoteExperimentUpsertForm = ({
  projectId,
  datasetId,
  existingRemoteExperiment,
  setShowRemoteExperimentUpsertForm,
  onBack,
}: {
  projectId: string;
  datasetId: string;
  existingRemoteExperiment?: {
    url: string;
    payload: Prisma.JsonValue;
    enabled?: boolean;
    displaySecretKey?: string | null;
    displayHeaders?: Record<string, { secret: boolean; value: string }>;
  } | null;
  setShowRemoteExperimentUpsertForm: (show: boolean) => void;
  onBack?: () => void;
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

  // Set when the mutation generated a new signing secret; shown exactly once.
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);

  const form = useForm<RemoteExperimentSetupForm>({
    resolver: zodResolver(RemoteExperimentSetupSchema),
    defaultValues: {
      url: existingRemoteExperiment?.url || "",
      defaultPayload: getFormattedPayload(existingRemoteExperiment?.payload),
      enabled: existingRemoteExperiment?.enabled ?? true,
      signingEnabled: Boolean(existingRemoteExperiment?.displaySecretKey),
      headers: Object.entries(
        existingRemoteExperiment?.displayHeaders ?? {},
      ).map(([name, header]) => ({
        name,
        value: "",
        isSecret: header.secret,
        displayValue: header.value,
      })),
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
        showSuccessToast({
          title: "Setup successfully",
          description: "Your changes have been saved.",
        });
        utils.datasets.getRemoteExperiment.invalidate({
          projectId,
          datasetId,
        });
        if (data.unencryptedSecretKey) {
          setOneTimeSecret(data.unencryptedSecretKey);
        } else {
          setShowRemoteExperimentUpsertForm(false);
        }
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

    const requestHeaders: Record<string, { secret: boolean; value: string }> =
      {};
    for (const [index, header] of data.headers.entries()) {
      const name = header.name.trim();
      if (!name) continue;
      if (REMOTE_EXPERIMENT_PROTECTED_HEADERS.includes(name.toLowerCase())) {
        form.setError(`headers.${index}.name`, {
          message: `"${name}" is set by Langfuse and cannot be overridden`,
        });
        return;
      }
      requestHeaders[name] = {
        secret: header.isSecret,
        value: header.value,
      };
    }

    upsertRemoteExperimentMutation.mutate({
      projectId,
      datasetId,
      url: data.url,
      defaultPayload: data.defaultPayload,
      enabled: data.enabled,
      signingEnabled: data.signingEnabled,
      requestHeaders,
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

  if (oneTimeSecret) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Save your signing secret</DialogTitle>
          <DialogDescription>
            Langfuse signs every remote experiment request with this secret via
            the <code>x-langfuse-signature</code> header. Store it in your
            service to verify that requests come from Langfuse. It can only be
            viewed once.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CodeView content={oneTimeSecret} defaultCollapsed={false} />
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => setShowRemoteExperimentUpsertForm(false)}
          >
            {"I've saved the secret"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <Button
          variant="ghost"
          onClick={() => {
            if (onBack) {
              onBack();
            } else {
              setShowRemoteExperimentUpsertForm(false);
            }
          }}
          className="inline-block self-start"
        >
          ← Back
        </Button>
        <DialogTitle>
          {existingRemoteExperiment
            ? "Edit remote experiment trigger"
            : "Set up remote experiment trigger in UI"}
        </DialogTitle>
        <DialogDescription>
          Enable your team to run custom experiments on dataset{" "}
          <strong>
            {dataset.isSuccess ? (
              <>&quot;{dataset.data?.name}&quot;</>
            ) : (
              <Spinner size="sm" display="inline" />
            )}
          </strong>
          . Configure a webhook URL to trigger remote custom experiments from
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
                    The URL that will be called when the remote experiment is
                    triggered.
                  </FormDescription>
                  <FormControl>
                    <Input
                      placeholder="https://your-service.com/webhook"
                      {...field}
                    />
                  </FormControl>
                  {field.value.startsWith("http://") && (
                    <p className="text-dark-yellow text-sm">
                      This endpoint uses plain HTTP: the payload and all headers
                      — including secret headers — will be sent unencrypted. Use
                      HTTPS for production endpoints.
                    </p>
                  )}
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
                    Set a default config that will be sent to the remote
                    experiment run URL. This can be modified before starting a
                    new run. View docs for more details.
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
              name="signingEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Sign requests</FormLabel>
                    <FormDescription>
                      {field.value
                        ? existingRemoteExperiment?.displaySecretKey
                          ? "Requests include an x-langfuse-signature header so your service can verify they come from Langfuse."
                          : "A signing secret will be generated when you save and shown once."
                        : "Requests will be sent without an x-langfuse-signature header."}
                    </FormDescription>
                    {field.value &&
                      existingRemoteExperiment?.displaySecretKey && (
                        <div className="pt-2">
                          <CodeView
                            className="bg-muted/50"
                            content={existingRemoteExperiment.displaySecretKey}
                            defaultCollapsed={true}
                          />
                          <div className="text-muted-foreground mt-1 text-xs">
                            Secret is encrypted and can only be viewed when
                            generated
                          </div>
                        </div>
                      )}
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

            <Accordion type="single" collapsible>
              <AccordionItem value="advanced" className="border-b-0">
                <AccordionTrigger className="justify-start gap-2 py-2 text-sm font-bold [&>svg]:order-first [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0">
                  Advanced Options
                </AccordionTrigger>
                <AccordionContent className="space-y-6 px-1 pt-2">
                  <div>
                    <FormLabel>Custom headers</FormLabel>
                    <FormDescription className="mb-2">
                      Optional headers to include in the request, e.g. for
                      authenticating with your service. Secret header values are
                      stored encrypted and shown masked.
                    </FormDescription>

                    {headerFields.map((field, index) => {
                      const isSecret = form.watch(`headers.${index}.isSecret`);
                      const displayValue = form.watch(
                        `headers.${index}.displayValue`,
                      );

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
                                    placeholder={displayValue || "Value"}
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
                              form.setValue(
                                `headers.${index}.isSecret`,
                                !isSecret,
                              )
                            }
                            title={
                              isSecret
                                ? "Make header public"
                                : "Make header secret"
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
                        appendHeader({
                          name: "",
                          value: "",
                          isSecret: false,
                          displayValue: "",
                        })
                      }
                      className="mt-2"
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add Custom Header
                    </Button>
                  </div>

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
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
                className="ml-auto"
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
