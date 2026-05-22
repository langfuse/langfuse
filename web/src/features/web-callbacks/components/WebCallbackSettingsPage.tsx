import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, Webhook, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import Header from "@/src/components/layouts/header";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

type WebCallbackEndpoint = RouterOutputs["webCallbacks"]["all"][number];

const BLOCKED_HEADER_NAMES = new Set([
  "content-length",
  "content-type",
  "cookie",
  "host",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const webCallbackFormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    url: z.url(),
    enabled: z.boolean(),
    toastMessage: z.string().trim().min(1).max(200),
    timeoutSeconds: z.number().int().min(1).max(60),
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

      if (!HEADER_NAME_PATTERN.test(name)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid header name.",
          path: ["headers", index, "name"],
        });
      }

      if (BLOCKED_HEADER_NAMES.has(lowerName)) {
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

type WebCallbackFormValues = z.infer<typeof webCallbackFormSchema>;

export function WebCallbackSettingsPage(props: { projectId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] =
    useState<WebCallbackEndpoint | null>(null);

  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  const endpoints = api.webCallbacks.all.useQuery(
    { projectId: props.projectId },
    { enabled: hasAccess },
  );
  const utils = api.useUtils();

  const deleteMutation = api.webCallbacks.delete.useMutation({
    onSuccess: async () => {
      await utils.webCallbacks.invalidate();
      showSuccessToast({
        title: "Callback endpoint deleted",
        description: "The endpoint was removed from this project.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to delete callback endpoint", error.message);
    },
  });

  if (!hasAccess) {
    return (
      <div>
        <Header title="Web Callbacks" />
        <Alert>
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to manage integrations for this project.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const configuredEndpoint = endpoints.data?.[0];
  const canCreateEndpoint = !configuredEndpoint;

  const openCreateDialog = () => {
    setEditingEndpoint(null);
    setDialogOpen(true);
  };

  const openEditDialog = (endpoint: WebCallbackEndpoint) => {
    setEditingEndpoint(endpoint);
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Header title="Web Callbacks" />
        <WebCallbackEndpointDialog
          projectId={props.projectId}
          endpoint={editingEndpoint}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingEndpoint(null);
            }
          }}
          trigger={
            <Button
              disabled={!canCreateEndpoint || endpoints.isLoading}
              onClick={openCreateDialog}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add endpoint
            </Button>
          }
        />
      </div>

      <p className="text-primary mb-4 text-sm">
        Configure a project-level callback endpoint for trace and observation
        detail actions. The browser sends a POST with ids only.
      </p>

      <Card className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-primary">Endpoint</TableHead>
              <TableHead className="text-primary">Behavior</TableHead>
              <TableHead className="text-primary">Headers</TableHead>
              <TableHead className="text-primary">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.data?.length === 0 ? (
              <TableRow>
                <TableCell
                  density="comfortable"
                  colSpan={5}
                  className="text-muted-foreground text-center"
                >
                  No callback endpoint configured.
                </TableCell>
              </TableRow>
            ) : (
              endpoints.data?.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell
                    density="comfortable"
                    className="max-w-xl font-mono break-all"
                  >
                    {endpoint.url}
                  </TableCell>
                  <TableCell density="comfortable">
                    <BehaviorSummary endpoint={endpoint} />
                  </TableCell>
                  <TableCell density="comfortable">
                    <HeaderList endpoint={endpoint} />
                  </TableCell>
                  <TableCell density="comfortable">
                    <StatusBadge
                      type={endpoint.enabled ? "active" : "disabled"}
                    />
                  </TableCell>
                  <TableCell density="comfortable" className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(endpoint)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit endpoint</TooltipContent>
                      </Tooltip>
                      <DeleteEndpointButton
                        endpoint={endpoint}
                        onDelete={(id) => {
                          deleteMutation.mutate({
                            projectId: props.projectId,
                            id,
                          });
                        }}
                        loading={deleteMutation.isPending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function HeaderList(props: { endpoint: WebCallbackEndpoint }) {
  const headerNames = Object.keys(props.endpoint.displayHeaders);

  if (headerNames.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {headerNames.map((name) => (
        <code key={name}>{name}</code>
      ))}
    </div>
  );
}

function BehaviorSummary(props: { endpoint: WebCallbackEndpoint }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="max-w-xs truncate" title={props.endpoint.toastMessage}>
        {props.endpoint.toastMessage}
      </div>
      <div className="text-muted-foreground">
        {props.endpoint.timeoutMs / 1_000}s timeout
      </div>
    </div>
  );
}

function WebCallbackEndpointDialog(props: {
  projectId: string;
  endpoint: WebCallbackEndpoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
}) {
  const utils = api.useUtils();
  const upsertMutation = api.webCallbacks.upsert.useMutation({
    onSuccess: async () => {
      await utils.webCallbacks.invalidate();
      showSuccessToast({
        title: props.endpoint
          ? "Callback endpoint updated"
          : "Callback endpoint created",
        description: "Web callback configuration was saved.",
      });
      props.onOpenChange(false);
    },
    onError: (error) => {
      showErrorToast("Failed to save callback endpoint", error.message);
    },
  });

  const form = useForm<WebCallbackFormValues>({
    resolver: zodResolver(webCallbackFormSchema),
    defaultValues: endpointToFormValues(props.endpoint),
  });
  const [langfuseOrigin, setLangfuseOrigin] = useState(
    "https://cloud.langfuse.com",
  );
  const watchedHeaders = form.watch("headers");
  const corsSnippet = useMemo(
    () => createCorsSnippet(langfuseOrigin, watchedHeaders),
    [langfuseOrigin, watchedHeaders],
  );

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "headers",
  });

  useEffect(() => {
    if (props.open) {
      form.reset(endpointToFormValues(props.endpoint));
    }
  }, [form, props.endpoint, props.open]);

  useEffect(() => {
    setLangfuseOrigin(window.location.origin);
  }, []);

  const onSubmit = (values: WebCallbackFormValues) => {
    upsertMutation.mutate({
      projectId: props.projectId,
      id: values.id,
      name: values.name,
      url: values.url,
      enabled: values.enabled,
      toastMessage: values.toastMessage,
      timeoutMs: values.timeoutSeconds * 1_000,
      requestHeaders: formValuesToRequestHeaders(values),
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {props.endpoint
              ? "Edit Callback Endpoint"
              : "Add Callback Endpoint"}
          </DialogTitle>
          <DialogDescription>
            The browser sends a JSON POST when a user clicks the trace callback
            action.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogBody>
              <Alert>
                <AlertTitle>Browser request requirements</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Your callback route must handle the browser preflight and
                    return these CORS headers on <code>OPTIONS</code> and{" "}
                    <code>POST</code> responses.
                  </p>
                  <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                    {corsSnippet}
                  </pre>
                  <p>
                    All headers configured below are sent to the user&apos;s
                    frontend and are visible in developer tools. Do not put API
                    keys or other secrets in web callback headers.
                  </p>
                </AlertDescription>
              </Alert>

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
                        placeholder="https://example.com/langfuse/callback"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      HTTP or HTTPS URL. Custom ports are allowed. The endpoint
                      must allow browser requests from Langfuse.
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
                        Shows the callback action in trace and observation
                        detail headers.
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
                      Shown immediately when the callback action is clicked.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timeoutSeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Request timeout</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        {...field}
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(event) =>
                          field.onChange(event.target.valueAsNumber)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Browser request timeout in seconds. Allowed range: 1-60.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>Headers</FormLabel>
                <FormDescription className="mb-2">
                  Optional browser-visible headers added to the outbound POST.
                  Content-Type is set automatically.
                </FormDescription>
                <div className="space-y-2">
                  {fields.map((field, index) => {
                    return (
                      <div
                        key={field.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
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
                                <Input placeholder="Value" {...field} />
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => props.onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={upsertMutation.isPending}>
                Save endpoint
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEndpointButton(props: {
  endpoint: WebCallbackEndpoint;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Trash2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Delete endpoint</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Callback Endpoint</DialogTitle>
          <DialogDescription>
            This removes the configured endpoint and hides the trace callback
            action.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={props.loading}
            onClick={() => {
              props.onDelete(props.endpoint.id);
              setOpen(false);
            }}
          >
            Delete endpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function createCorsSnippet(
  langfuseOrigin: string,
  headers: WebCallbackFormValues["headers"],
) {
  const configuredHeaderNames = headers
    .map((header) => header.name.trim().toLowerCase())
    .filter(Boolean);
  const allowedHeaderNames = Array.from(
    new Set(["content-type"].concat(configuredHeaderNames)),
  );

  return [
    "Access-Control-Allow-Origin: " + langfuseOrigin,
    "Access-Control-Allow-Methods: POST, OPTIONS",
    "Access-Control-Allow-Headers: " + allowedHeaderNames.join(", "),
  ].join("\n");
}

const endpointToFormValues = (
  endpoint: WebCallbackEndpoint | null,
): WebCallbackFormValues => ({
  id: endpoint?.id,
  name: endpoint?.name ?? "Default",
  url: endpoint?.url ?? "",
  enabled: endpoint?.enabled ?? true,
  toastMessage: endpoint?.toastMessage ?? "Callback sent",
  timeoutSeconds: endpoint ? Math.ceil(endpoint.timeoutMs / 1_000) : 10,
  headers: Object.entries(endpoint?.displayHeaders ?? {})
    .filter(([, header]) => !header.secret)
    .map(([name, header]) => ({
      name,
      value: header.value,
    })),
});

const formValuesToRequestHeaders = (
  values: WebCallbackFormValues,
): Record<string, { secret: boolean; value: string }> =>
  Object.fromEntries(
    values.headers
      .filter((header) => header.name.trim())
      .map((header) => [
        header.name.trim(),
        {
          secret: false,
          value: header.value.trim(),
        },
      ]),
  );

export function WebCallbackIntegrationCard(props: {
  projectId: string;
  hasAccess: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="mb-4 flex items-center gap-2">
        <Webhook className="text-foreground h-5 w-5" />
        <span className="font-semibold">Web Callbacks</span>
      </div>
      <p className="text-primary mb-4 text-sm">
        Send a browser callback from trace and observation detail views to your
        own application.
      </p>
      <Button
        asChild
        variant="secondary"
        disabled={!props.hasAccess}
        className={cn(!props.hasAccess && "pointer-events-none")}
      >
        <Link
          href={`/project/${props.projectId}/settings/integrations/web-callbacks`}
        >
          Configure
        </Link>
      </Button>
    </Card>
  );
}
