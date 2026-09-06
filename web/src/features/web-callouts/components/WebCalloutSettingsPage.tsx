/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, Webhook, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { ActionButton } from "@/src/components/ActionButton";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { Alert } from "@/src/components/design-system/Alert/Alert";
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
import { Switch } from "@/src/components/design-system/Switch/Switch";
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
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  WEB_CALLOUT_BLOCKED_HEADER_NAMES,
  WEB_CALLOUT_HEADER_NAME_PATTERN,
} from "@/src/features/web-callouts/headerRules";
import { api, type RouterOutputs } from "@/src/utils/api";

type WebCalloutEndpoint = RouterOutputs["webCallouts"]["all"][number];

const createWebCalloutFormSchema = (messages: {
  invalidHeader: string;
  blockedHeader: string;
  duplicateHeader: string;
}) =>
  z
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
            message: messages.invalidHeader,
            path: ["headers", index, "name"],
          });
        }

        if (WEB_CALLOUT_BLOCKED_HEADER_NAMES.has(lowerName)) {
          ctx.addIssue({
            code: "custom",
            message: messages.blockedHeader,
            path: ["headers", index, "name"],
          });
        }

        if (seenHeaderNames.has(lowerName)) {
          ctx.addIssue({
            code: "custom",
            message: messages.duplicateHeader,
            path: ["headers", index, "name"],
          });
        }

        seenHeaderNames.add(lowerName);
      });
    });

type WebCalloutFormValues = z.infer<
  ReturnType<typeof createWebCalloutFormSchema>
>;

export function WebCalloutSettingsPage(props: { projectId: string }) {
  const t = useTranslations("integrationsSettings.webCallouts");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] =
    useState<WebCalloutEndpoint | null>(null);

  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "integrations:CRUD",
  });

  const endpoints = api.webCallouts.all.useQuery(
    { projectId: props.projectId },
    { enabled: hasAccess },
  );
  const utils = api.useUtils();

  const deleteMutation = api.webCallouts.delete.useMutation({
    onSuccess: async () => {
      await utils.webCallouts.invalidate();
      showSuccessToast({
        title: t("deletedTitle"),
        description: t("deletedDescription"),
      });
    },
    onError: (error) => {
      showErrorToast(t("deleteFailed"), error.message);
    },
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

  const configuredEndpoint = endpoints.data?.[0];
  const canCreateEndpoint = !configuredEndpoint;
  const addEndpointDisabledReason = endpoints.isLoading
    ? t("loading")
    : !canCreateEndpoint
      ? t("limit")
      : undefined;

  const openCreateDialog = () => {
    setEditingEndpoint(null);
    setDialogOpen(true);
  };

  const openEditDialog = (endpoint: WebCalloutEndpoint) => {
    setEditingEndpoint(endpoint);
    setDialogOpen(true);
  };

  return (
    <div>
      <p className="text-primary mb-4 text-sm">
        {t.rich("description", {
          docs: (chunks) => (
            <a
              href="https://langfuse.com/docs/observability/features/web-callouts"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {chunks}
            </a>
          ),
        })}
      </p>

      <div className="mb-4 flex justify-end">
        <WebCalloutEndpointDialog
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
            <AddEndpointButton
              disabledReason={addEndpointDisabledReason}
              onClick={openCreateDialog}
            />
          }
        />
      </div>

      <Card className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-primary">
                {t("columns.name")}
              </TableHead>
              <TableHead className="text-primary">
                {t("columns.endpoint")}
              </TableHead>
              <TableHead className="text-primary">
                {t("columns.toast")}
              </TableHead>
              <TableHead className="text-primary">
                {t("columns.headers")}
              </TableHead>
              <TableHead className="text-primary">
                {t("columns.status")}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.data?.length === 0 ? (
              <TableRow>
                <TableCell
                  density="comfortable"
                  colSpan={6}
                  className="text-muted-foreground text-center"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              endpoints.data?.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell density="comfortable" className="font-bold">
                    {endpoint.name}
                  </TableCell>
                  <TableCell
                    density="comfortable"
                    className="max-w-xl font-mono break-all"
                  >
                    {endpoint.url}
                  </TableCell>
                  <TableCell density="comfortable">
                    <ToastMessageCell endpoint={endpoint} />
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
                        <TooltipContent>{t("edit")}</TooltipContent>
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

function AddEndpointButton(props: {
  disabledReason?: string;
  onClick: () => void;
}) {
  const t = useTranslations("integrationsSettings.webCallouts");
  const button = (
    <Button
      disabled={Boolean(props.disabledReason)}
      className={props.disabledReason ? "pointer-events-none" : undefined}
      onClick={props.onClick}
    >
      <Plus className="mr-1 h-4 w-4" />
      {t("add")}
    </Button>
  );

  if (!props.disabledReason) {
    return <DialogTrigger asChild>{button}</DialogTrigger>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{props.disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function HeaderList(props: { endpoint: WebCalloutEndpoint }) {
  const t = useTranslations("integrationsSettings.webCallouts");
  const headers = props.endpoint.requestHeaderKeys;

  if (headers.length === 0) {
    return <span className="text-muted-foreground">{t("none")}</span>;
  }

  return (
    <span className="font-mono text-sm break-words">{headers.join(", ")}</span>
  );
}

function ToastMessageCell(props: { endpoint: WebCalloutEndpoint }) {
  return (
    <div
      className="max-w-xs truncate text-sm"
      title={props.endpoint.toastMessage}
    >
      {props.endpoint.toastMessage}
    </div>
  );
}

function WebCalloutEndpointDialog(props: {
  projectId: string;
  endpoint: WebCalloutEndpoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
}) {
  const t = useTranslations("integrationsSettings.webCallouts");
  const utils = api.useUtils();
  const upsertMutation = api.webCallouts.upsert.useMutation({
    onSuccess: async () => {
      await utils.webCallouts.invalidate();
      showSuccessToast({
        title: props.endpoint ? t("updatedTitle") : t("createdTitle"),
        description: t("savedDescription"),
      });
      props.onOpenChange(false);
    },
    onError: (error) => {
      showErrorToast(t("saveFailed"), error.message);
    },
  });

  const formSchema = createWebCalloutFormSchema({
    invalidHeader: t("form.invalidHeader"),
    blockedHeader: t("form.blockedHeader"),
    duplicateHeader: t("form.duplicateHeader"),
  });

  const form = useForm<WebCalloutFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: endpointToFormValues(props.endpoint),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "headers",
  });

  useEffect(() => {
    if (props.open) {
      form.reset(endpointToFormValues(props.endpoint));
    }
  }, [form, props.endpoint, props.open]);

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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.trigger}
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {props.endpoint ? t("editTitle") : t("addTitle")}
          </DialogTitle>
          <DialogDescription>
            {t.rich("dialogDescription", {
              docs: (chunks) => (
                <a
                  href="https://langfuse.com/docs/observability/features/web-callouts"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
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
                    <FormLabel>{t("form.name")}</FormLabel>
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
                    <FormLabel>{t("form.url")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/langfuse/callout"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("form.urlDescription")}
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
                      <FormLabel>{t("form.enabled")}</FormLabel>
                      <FormDescription>
                        {t("form.enabledDescription")}
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
                    <FormLabel>{t("form.toast")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      {t("form.toastDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>{t("form.headers")}</FormLabel>
                <FormDescription className="mb-2">
                  {t("form.headersDescription")}
                </FormDescription>
                <div className="space-y-2">
                  {fields.map((field, index) => {
                    const currentHeaderName = form.watch(
                      `headers.${index}.name`,
                    );
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
                                <Input
                                  placeholder={t("form.headerName")}
                                  {...field}
                                />
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
                                      : t("form.headerValue")
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
                          <TooltipContent>
                            {t("form.removeHeader")}
                          </TooltipContent>
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
                  {t("form.addHeader")}
                </Button>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => props.onOpenChange(false)}
              >
                {t("form.cancel")}
              </Button>
              <Button type="submit" loading={upsertMutation.isPending}>
                {t("form.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEndpointButton(props: {
  endpoint: WebCalloutEndpoint;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const t = useTranslations("integrationsSettings.webCallouts");
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
        <TooltipContent>{t("delete")}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>{t("deleteDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("form.cancel")}
          </Button>
          <Button
            variant="destructive"
            loading={props.loading}
            onClick={() => {
              props.onDelete(props.endpoint.id);
              setOpen(false);
            }}
          >
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  headers: (endpoint?.requestHeaderKeys ?? []).map((name) => ({
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
      (headerName) => headerName.toLowerCase() === normalizedName,
    ) ?? false
  );
};

export function WebCalloutIntegrationCard(props: {
  projectId: string;
  hasAccess: boolean;
}) {
  const t = useTranslations("integrationsSettings.webCallouts");
  return (
    <Card className="p-3">
      <div className="mb-4 flex items-center gap-2">
        <Webhook className="text-foreground h-5 w-5" />
        <span className="font-bold">{t("title")}</span>
      </div>
      <p className="text-primary mb-4 text-sm">{t("cardDescription")}</p>
      <ActionButton
        variant="secondary"
        hasAccess={props.hasAccess}
        href={`/project/${props.projectId}/settings/integrations/web-callouts`}
      >
        {t("configure")}
      </ActionButton>
    </Card>
  );
}
