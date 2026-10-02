import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Webhook, X } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { ActionButton } from "@/src/components/ActionButton";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
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
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  WEB_CALLOUT_BLOCKED_HEADER_NAMES,
  WEB_CALLOUT_HEADER_NAME_PATTERN,
} from "@/src/features/web-callouts/headerRules";
import { api, type RouterOutputs } from "@/src/utils/api";
import { ConnectedWebCalloutSettingsTable } from "./WebCalloutSettingsTable/ConnectedWebCalloutSettingsTable";

type WebCalloutEndpoint = RouterOutputs["webCallouts"]["all"][number];

const webCalloutFormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    url: z.url(),
    enabled: z.boolean(),
    toastMessage: z.string().trim().min(1).max(200),
    headers: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const seenHeaderNames = new Set<string>();

    data.headers.forEach((header, index) => {
      const name = header.name.trim();

      if (!name) {
        return;
      }

      const lowerName = name.toLowerCase();

      if (!WEB_CALLOUT_HEADER_NAME_PATTERN.test(name)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid header name.",
          path: ["headers", index, "name"],
        });
      }

      if (WEB_CALLOUT_BLOCKED_HEADER_NAMES.has(lowerName)) {
        ctx.addIssue({
          code: "custom",
          message: "This header is set by Langfuse and cannot be customized.",
          path: ["headers", index, "name"],
        });
      }

      if (seenHeaderNames.has(lowerName)) {
        ctx.addIssue({
          code: "custom",
          message: "Header names must be unique.",
          path: ["headers", index, "name"],
        });
      }

      seenHeaderNames.add(lowerName);
    });
  });

type WebCalloutFormValues = z.infer<typeof webCalloutFormSchema>;

export function WebCalloutSettingsPage(props: { projectId: string }) {
  const [formKey, setFormKey] = useState(0);

  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  if (!hasAccess) {
    return (
      <div>
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to manage integrations for this project.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <p className="text-primary mb-4 text-sm">
        Configure a project-level callout. Your users can trigger a POST to an
        endpoint on trace, observation, and session detail screens. This can be
        used to integrate with your services to trigger workflows. See the docs{" "}
        <a
          href="https://langfuse.com/docs/observability/features/web-callouts"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          here
        </a>{" "}
        for more info.
      </p>

      <DialogController<{ endpoint: WebCalloutEndpoint | null }>
        renderDialog={({ state, closeDialog }) => (
          <WebCalloutEndpointDialog
            key={formKey}
            projectId={props.projectId}
            endpoint={state.endpoint}
            closeDialog={closeDialog}
          />
        )}
      >
        {({ openDialog }) => (
          <ConnectedWebCalloutSettingsTable
            projectId={props.projectId}
            onCreate={() => {
              setFormKey((key) => key + 1);
              openDialog({ endpoint: null });
            }}
            onEdit={(endpoint) => {
              setFormKey((key) => key + 1);
              openDialog({ endpoint });
            }}
          />
        )}
      </DialogController>
    </div>
  );
}

function WebCalloutEndpointDialog(props: {
  projectId: string;
  endpoint: WebCalloutEndpoint | null;
  closeDialog: () => void;
}) {
  const utils = api.useUtils();
  const upsertMutation = api.webCallouts.upsert.useMutation({
    onSuccess: async () => {
      await utils.webCallouts.invalidate();
      showSuccessToast({
        title: props.endpoint
          ? "Callout endpoint updated"
          : "Callout endpoint created",
        description: "Web callout configuration was saved.",
      });
      props.closeDialog();
    },
    onError: (error) => {
      showErrorToast("Failed to save callout endpoint", error.message);
    },
  });

  const form = useForm<WebCalloutFormValues>({
    resolver: zodResolver(webCalloutFormSchema),
    defaultValues: endpointToFormValues(props.endpoint),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "headers",
  });

  const onSubmit = (values: WebCalloutFormValues) => {
    upsertMutation.mutate({
      projectId: props.projectId,
      id: values.id,
      name: values.name,
      url: values.url,
      enabled: values.enabled,
      toastMessage: values.toastMessage,
      requestHeaders: formValuesToRequestHeaders(values),
    });
  };

  return (
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>
          {props.endpoint ? "Edit Callout Endpoint" : "Add Callout Endpoint"}
        </DialogTitle>
        <DialogDescription>
          Langfuse sends a backend JSON POST when a user clicks a web callout
          action.{" "}
          <a
            href="https://langfuse.com/docs/observability/features/web-callouts"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            View docs
          </a>
          .
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="min-h-0">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/langfuse/callout"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    HTTP or HTTPS URL. Custom ports are allowed. The endpoint is
                    called from the Langfuse backend.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <FormLabel>Enabled</FormLabel>
                    <FormDescription>
                      Shows the callout action in trace, observation, and
                      session detail headers.
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

            <FormField
              control={form.control}
              name="toastMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Toast message</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    Shown after the backend callout succeeds.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Headers</FormLabel>
              <FormDescription className="mb-2">
                Optional headers added to the backend POST. Content-Type is set
                automatically. Leave values empty for existing header names to
                keep encrypted values.
              </FormDescription>
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const currentHeaderName = form.watch(`headers.${index}.name`);
                  const preservesExistingValue = hasExistingHeaderName(
                    props.endpoint,
                    currentHeaderName,
                  );

                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2"
                    >
                      <FormField
                        control={form.control}
                        name={`headers.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="Header name" {...field} />
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
                                placeholder={
                                  preservesExistingValue
                                    ? "***"
                                    : "Header value"
                                }
                                type="password"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove header</TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                onClick={() =>
                  append({
                    name: "",
                    value: "",
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add header
              </Button>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={props.closeDialog}>
              Cancel
            </Button>
            <Button type="submit" loading={upsertMutation.isPending}>
              Save endpoint
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}

const endpointToFormValues = (
  endpoint: WebCalloutEndpoint | null,
): WebCalloutFormValues => ({
  id: endpoint?.id,
  name: endpoint?.name ?? "Default",
  url: endpoint?.url ?? "",
  enabled: endpoint?.enabled ?? true,
  toastMessage: endpoint?.toastMessage ?? "Callout sent",
  headers: (endpoint?.requestHeaderKeys ?? []).map((name: string) => ({
    name,
    value: "",
  })),
});

const formValuesToRequestHeaders = (
  values: WebCalloutFormValues,
): Record<string, string> =>
  Object.fromEntries(
    values.headers
      .filter((header) => header.name.trim())
      .map((header) => [header.name.trim(), header.value.trim()]),
  );

const hasExistingHeaderName = (
  endpoint: WebCalloutEndpoint | null,
  name: string,
) => {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  return (
    endpoint?.requestHeaderKeys.some(
      (headerName: string) => headerName.toLowerCase() === normalizedName,
    ) ?? false
  );
};

export function WebCalloutIntegrationCard(props: {
  projectId: string;
  hasAccess: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="mb-4 flex items-center gap-2">
        <Webhook className="text-foreground h-5 w-5" />
        <span className="font-bold">Web Callouts</span>
      </div>
      <p className="text-primary mb-4 text-sm">
        Send backend callouts from trace, observation, and session detail views
        to your own application.
      </p>
      <ActionButton
        variant="secondary"
        hasAccess={props.hasAccess}
        href={`/project/${props.projectId}/settings/integrations/web-callouts`}
      >
        Configure
      </ActionButton>
    </Card>
  );
}
