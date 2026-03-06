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
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/src/components/ui/tooltip";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  blobStorageIntegrationFormSchema,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/src/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  AnalyticsIntegrationExportSource,
  type BlobStorageIntegration,
  EXPORT_SOURCE_OPTIONS,
} from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { Info, ExternalLink, X, ChevronDown, Plus } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { ScrollArea } from "@/src/components/ui/scroll-area";

export default function BlobStorageIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const state = api.blobStorageIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
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
        title: "Blob Storage Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: <>{status && <StatusBadge type={status} />}</>,
        actionButtonsRight: (
          <Button asChild variant="secondary">
            <Link
              href="https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage"
              target="_blank"
            >
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="mb-4 text-sm text-primary">
        Configure scheduled exports of your trace data to AWS S3, S3-compatible
        storages, or Azure Blob Storage. Set up a hourly, daily, or weekly
        export to your own storage for data analysis or backup purposes. Use the
        &quot;Validate&quot; button to test your configuration by uploading a
        small test file, and the &quot;Run Now&quot; button to trigger an
        immediate export.
      </p>
      {!hasAccess && (
        <p className="text-sm">
          Your current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      )}
      {hasAccess && (
        <>
          <Header title="Configuration" />
          <Card className="p-3">
            <BlobStorageIntegrationSettingsForm
              state={state.data || undefined}
              projectId={projectId}
              isLoading={state.isLoading}
            />
          </Card>
        </>
      )}
      {state.data?.enabled && (
        <>
          <Header title="Status" className="mt-8" />
          <div className="space-y-2">
            <p className="text-sm text-primary">
              Data last exported:{" "}
              {state.data?.lastSyncAt
                ? new Date(state.data.lastSyncAt).toLocaleString()
                : "Never (pending)"}
            </p>
            <p className="text-sm text-primary">
              Export mode:{" "}
              {state.data?.exportMode === BlobStorageExportMode.FULL_HISTORY
                ? "Full history"
                : state.data?.exportMode === BlobStorageExportMode.FROM_TODAY
                  ? "From setup date"
                  : state.data?.exportMode ===
                      BlobStorageExportMode.FROM_CUSTOM_DATE
                    ? "From custom date"
                    : "Unknown"}
            </p>
            {(state.data?.exportMode ===
              BlobStorageExportMode.FROM_CUSTOM_DATE ||
              state.data?.exportMode === BlobStorageExportMode.FROM_TODAY) &&
              state.data?.exportStartDate && (
                <p className="text-sm text-primary">
                  Export start date:{" "}
                  {new Date(state.data.exportStartDate).toLocaleDateString()}
                </p>
              )}
          </div>
        </>
      )}
    </ContainerPage>
  );
}

const BlobStorageIntegrationSettingsForm = ({
  state,
  projectId,
  isLoading,
}: {
  state?: Partial<BlobStorageIntegration>;
  projectId: string;
  isLoading: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { isBetaEnabled } = useV4Beta();
  const [integrationType, setIntegrationType] =
    useState<BlobStorageIntegrationType>(BlobStorageIntegrationType.S3);

  // Check if this is a self-hosted instance (no cloud region set)
  const isSelfHosted = !isLangfuseCloud;

  const blobStorageForm = useForm({
    resolver: zodResolver(blobStorageIntegrationFormSchema),
    defaultValues: {
      type: state?.type || BlobStorageIntegrationType.S3,
      bucketName: state?.bucketName || "",
      endpoint: state?.endpoint || null,
      region: state?.region || "",
      accessKeyId: state?.accessKeyId || "",
      secretAccessKey: state?.secretAccessKey || null,
      prefix: state?.prefix || "",
      exportFrequency: (state?.exportFrequency || "daily") as
        | "daily"
        | "weekly"
        | "hourly",
      enabled: state?.enabled || false,
      forcePathStyle: state?.forcePathStyle || false,
      fileType: state?.fileType || BlobStorageIntegrationFileType.JSONL,
      exportMode: state?.exportMode || BlobStorageExportMode.FULL_HISTORY,
      exportStartDate: state?.exportStartDate || null,
      exportSource:
        state?.exportSource ||
        (isBetaEnabled
          ? AnalyticsIntegrationExportSource.EVENTS
          : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS),
      exportTraces: state?.exportTraces ?? true,
      exportObservations: state?.exportObservations ?? true,
      exportScores: state?.exportScores ?? true,
      exportEvents: state?.exportEvents ?? null,
      tagFilters:
        (state?.tagFilters as {
          operator: "any of" | "all of" | "none of";
          tags: string[];
        }[]) ?? [],
    },
    disabled: isLoading,
  });

  // Fetch available tags for the project
  const availableTagsQuery =
    api.blobStorageIntegration.getAvailableTags.useQuery(
      { projectId },
      {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
    );

  useEffect(() => {
    setIntegrationType(state?.type || BlobStorageIntegrationType.S3);
    blobStorageForm.reset({
      type: state?.type || BlobStorageIntegrationType.S3,
      bucketName: state?.bucketName || "",
      endpoint: state?.endpoint || null,
      region: state?.region || "auto",
      accessKeyId: state?.accessKeyId || "",
      secretAccessKey: state?.secretAccessKey || null,
      prefix: state?.prefix || "",
      exportFrequency: (state?.exportFrequency || "daily") as
        | "daily"
        | "weekly"
        | "hourly",
      enabled: state?.enabled || false,
      forcePathStyle: state?.forcePathStyle || false,
      fileType: state?.fileType || BlobStorageIntegrationFileType.JSONL,
      exportMode: state?.exportMode || BlobStorageExportMode.FULL_HISTORY,
      exportStartDate: state?.exportStartDate || null,
      exportSource:
        state?.exportSource ||
        (isBetaEnabled
          ? AnalyticsIntegrationExportSource.EVENTS
          : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS),
      exportTraces: state?.exportTraces ?? true,
      exportObservations: state?.exportObservations ?? true,
      exportScores: state?.exportScores ?? true,
      exportEvents: state?.exportEvents ?? null,
      tagFilters:
        (state?.tagFilters as {
          operator: "any of" | "all of" | "none of";
          tags: string[];
        }[]) ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const utils = api.useUtils();
  const mut = api.blobStorageIntegration.update.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
  });
  const mutDelete = api.blobStorageIntegration.delete.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
  });
  const mutRunNow = api.blobStorageIntegration.runNow.useMutation({
    onSuccess: () => {
      utils.blobStorageIntegration.invalidate();
    },
  });
  const mutValidate = api.blobStorageIntegration.validate.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: data.message,
        description: `Test file: ${data.testFileName}`,
      });
    },
    onError: (error) => {
      showErrorToast("Validation failed", error.message);
    },
  });

  async function onSubmit(values: BlobStorageIntegrationFormSchema) {
    capture("integrations:blob_storage_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  const handleIntegrationTypeChange = (value: BlobStorageIntegrationType) => {
    setIntegrationType(value);
    blobStorageForm.setValue("type", value);
  };

  return (
    <Form {...blobStorageForm}>
      <form
        className="space-y-3"
        onSubmit={blobStorageForm.handleSubmit(onSubmit)}
      >
        <FormField
          control={blobStorageForm.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Storage Provider</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(value) =>
                    handleIntegrationTypeChange(
                      value as BlobStorageIntegrationType,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S3">AWS S3</SelectItem>
                    <SelectItem value="S3_COMPATIBLE">
                      S3 Compatible Storage
                    </SelectItem>
                    <SelectItem value="AZURE_BLOB_STORAGE">
                      Azure Blob Storage
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                Choose your cloud storage provider
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="bucketName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? "Container Name"
                  : "Bucket Name"}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? "The Azure storage container name"
                  : "The S3 bucket name"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Endpoint URL field - Only shown for S3-compatible and Azure */}
        {integrationType !== "S3" && (
          <FormField
            control={blobStorageForm.control}
            name="endpoint"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endpoint URL</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value || ""} />
                </FormControl>
                <FormDescription>
                  {integrationType === "AZURE_BLOB_STORAGE"
                    ? "Azure Blob Storage endpoint URL (e.g., https://accountname.blob.core.windows.net)"
                    : "S3 compatible endpoint URL (e.g., https://play.min.io)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Region field - Only shown for AWS S3 or compatible storage */}
        {integrationType !== "AZURE_BLOB_STORAGE" && (
          <FormField
            control={blobStorageForm.control}
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Region</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  {integrationType === "S3"
                    ? "AWS region (e.g., us-east-1)"
                    : "S3 compatible storage region"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Force Path Style switch - Only shown for S3-compatible */}
        {integrationType === "S3_COMPATIBLE" && (
          <FormField
            control={blobStorageForm.control}
            name="forcePathStyle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Force Path Style</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="ml-4 mt-1"
                  />
                </FormControl>
                <FormDescription>
                  Enable for MinIO and some other S3 compatible providers
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={blobStorageForm.control}
          name="accessKeyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? "Storage Account Name"
                  : integrationType === "S3"
                    ? "AWS Access Key ID"
                    : "Access Key ID"}
                {/* Show optional indicator for S3 types on self-hosted instances with entitlement */}
                {isSelfHosted && integrationType === "S3" && (
                  <span className="text-muted-foreground"> (optional)</span>
                )}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? "Your Azure storage account name"
                  : integrationType === "S3"
                    ? isSelfHosted
                      ? "Your AWS IAM user access key ID. Leave empty to use host credentials (IAM roles, instance profiles, etc.)"
                      : "Your AWS IAM user access key ID"
                    : "Access key for your S3-compatible storage"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="secretAccessKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? "Storage Account Key"
                  : integrationType === "S3"
                    ? "AWS Secret Access Key"
                    : "Secret Access Key"}
                {/* Show optional indicator for S3 types on self-hosted instances with entitlement */}
                {isSelfHosted && integrationType === "S3" && (
                  <span className="text-muted-foreground"> (optional)</span>
                )}
              </FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder="********************"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? "Your Azure storage account access key"
                  : integrationType === "S3"
                    ? isSelfHosted
                      ? "Your AWS IAM user secret access key. Leave empty to use host credentials (IAM roles, instance profiles, etc.)"
                      : "Your AWS IAM user secret access key"
                    : "Secret key for your S3-compatible storage"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="prefix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Export Prefix</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? 'Optional prefix path for exported files in your Azure container (e.g., "langfuse-exports/")'
                  : integrationType === "S3"
                    ? 'Optional prefix path for exported files in your S3 bucket (e.g., "langfuse-exports/")'
                    : 'Optional prefix path for exported files (e.g., "langfuse-exports/")'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="exportFrequency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Export Frequency</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                How often the data should be exported. Changes are taken into
                consideration from the next run onwards.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="fileType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>File Type</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select file type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JSONL">JSONL</SelectItem>
                    <SelectItem value="CSV">CSV</SelectItem>
                    <SelectItem value="JSON">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                The file format for exported data.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="exportMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Export Mode</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select export mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BlobStorageExportMode.FULL_HISTORY}>
                      Full history
                    </SelectItem>
                    <SelectItem value={BlobStorageExportMode.FROM_TODAY}>
                      Today
                    </SelectItem>
                    <SelectItem value={BlobStorageExportMode.FROM_CUSTOM_DATE}>
                      Custom date
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                Choose when to start exporting data. &quot;Today&quot; and
                &quot;Custom date&quot; modes will not include historical data
                before the specified date.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isBetaEnabled && (
          <FormField
            control={blobStorageForm.control}
            name="exportSource"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5 pt-2">
                  Export Source
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[350px] space-y-2 p-3"
                    >
                      {EXPORT_SOURCE_OPTIONS.map((option) => (
                        <div key={option.value} className="space-y-0.5">
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      ))}
                      <div className="border-t pt-2">
                        <a
                          href="https://langfuse.com/docs/integrations/export-sources"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          For further information see
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select data to export" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EXPORT_SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose which data sources to export to blob storage. Scores
                  are always included.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Granular Export Selection */}
        <FormItem>
          <FormLabel>Export Data Types</FormLabel>
          <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
            <FormField
              control={blobStorageForm.control}
              name="exportTraces"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? true : false)
                      }
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Traces</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={blobStorageForm.control}
              name="exportObservations"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? true : false)
                      }
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Observations</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={blobStorageForm.control}
              name="exportScores"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? true : false)
                      }
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Scores</FormLabel>
                </FormItem>
              )}
            />
            {isBetaEnabled && (
              <FormField
                control={blobStorageForm.control}
                name="exportEvents"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={(checked) =>
                          field.onChange(checked ? true : false)
                        }
                      />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Events (Enriched Observations)
                    </FormLabel>
                  </FormItem>
                )}
              />
            )}
          </div>
          <FormDescription>
            Choose which data types to include in your exports.
          </FormDescription>
          {(blobStorageForm.formState.errors as Record<string, unknown>)
            ._exportValidation ? (
            <p className="text-sm font-medium text-destructive">
              {String(
                (
                  (blobStorageForm.formState.errors as Record<string, unknown>)
                    ._exportValidation as { message?: string }
                )?.message ?? "",
              )}
            </p>
          ) : null}
        </FormItem>

        {/* Tag Filtering */}
        <FormField
          control={blobStorageForm.control}
          name="tagFilters"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Filter by Tags (Optional)</FormLabel>
              <div className="space-y-2">
                {/* List of filter conditions */}
                {(field.value ?? []).map((filter, filterIndex) => (
                  <div
                    key={filterIndex}
                    className="flex items-start gap-2 rounded-md border p-3"
                  >
                    <span className="mt-2 text-sm text-muted-foreground">
                      {filterIndex === 0 ? "Where" : "And"}
                    </span>
                    <div className="flex flex-1 flex-col gap-2">
                      {/* Operator selector */}
                      <Select
                        value={filter.operator}
                        onValueChange={(value) => {
                          const newFilters = [...(field.value ?? [])];
                          newFilters[filterIndex] = {
                            ...filter,
                            operator: value as "any of" | "all of" | "none of",
                          };
                          field.onChange(newFilters);
                        }}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any of">Any of (OR)</SelectItem>
                          <SelectItem value="all of">All of (AND)</SelectItem>
                          <SelectItem value="none of">
                            None of (exclude)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Selected tags as badges */}
                      {filter.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {filter.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="flex items-center gap-1"
                            >
                              {tag}
                              <button
                                type="button"
                                className="ml-1 rounded-full hover:bg-muted-foreground/20"
                                onClick={() => {
                                  const newFilters = [...(field.value ?? [])];
                                  newFilters[filterIndex] = {
                                    ...filter,
                                    tags: filter.tags.filter((t) => t !== tag),
                                  };
                                  field.onChange(newFilters);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      {/* Tag selector popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-fit justify-between"
                          >
                            <span className="text-muted-foreground">
                              {filter.tags.length > 0
                                ? "Add more tags..."
                                : "Select tags..."}
                            </span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0" align="start">
                          {availableTagsQuery.isLoading ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              Loading tags...
                            </div>
                          ) : !availableTagsQuery.data ||
                            availableTagsQuery.data.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No tags found in this project
                            </div>
                          ) : (
                            <ScrollArea className="max-h-60">
                              <div className="p-2">
                                {availableTagsQuery.data.map((tag) => (
                                  <div
                                    key={tag}
                                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                                    onClick={() => {
                                      const newFilters = [
                                        ...(field.value ?? []),
                                      ];
                                      const currentTags = filter.tags;
                                      if (currentTags.includes(tag)) {
                                        newFilters[filterIndex] = {
                                          ...filter,
                                          tags: currentTags.filter(
                                            (t) => t !== tag,
                                          ),
                                        };
                                      } else {
                                        newFilters[filterIndex] = {
                                          ...filter,
                                          tags: [...currentTags, tag],
                                        };
                                      }
                                      field.onChange(newFilters);
                                    }}
                                  >
                                    <Checkbox
                                      checked={filter.tags.includes(tag)}
                                      onCheckedChange={() => {
                                        // Handled by parent onClick
                                      }}
                                    />
                                    <span className="text-sm">{tag}</span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                    {/* Remove filter button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1"
                      onClick={() => {
                        const newFilters = (field.value ?? []).filter(
                          (_, i) => i !== filterIndex,
                        );
                        field.onChange(newFilters);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {/* Add filter button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    field.onChange([
                      ...(field.value ?? []),
                      { operator: "any of" as const, tags: [] },
                    ]);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add filter
                </Button>
              </div>
              <FormDescription>
                Add multiple tag filter conditions. All conditions are combined
                with AND logic. Tag filtering applies to traces, observations,
                and events (not scores).
              </FormDescription>
            </FormItem>
          )}
        />

        {blobStorageForm.watch("exportMode") ===
          BlobStorageExportMode.FROM_CUSTOM_DATE && (
          <FormField
            control={blobStorageForm.control}
            name="exportStartDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Export Start Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={
                      field.value instanceof Date
                        ? field.value.toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) => {
                      const date = e.target.value
                        ? new Date(e.target.value)
                        : null;
                      field.onChange(date);
                    }}
                    placeholder="Select start date"
                  />
                </FormControl>
                <FormDescription>
                  Data before this date will not be included in exports
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={blobStorageForm.control}
          name="enabled"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enabled</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
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
          loading={mut.isPending}
          onClick={blobStorageForm.handleSubmit(onSubmit)}
          disabled={isLoading}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          loading={mutValidate.isPending}
          disabled={isLoading || !state}
          title="Test your saved configuration by uploading a small test file to your storage"
          onClick={async () => {
            const isValid = await blobStorageForm.trigger();
            if (isValid) {
              mutValidate.mutate({ projectId });
            }
          }}
        >
          Validate
        </Button>
        <Button
          variant="secondary"
          loading={mutRunNow.isPending}
          disabled={isLoading || !state?.enabled}
          title="Trigger an immediate export of all data since the last sync"
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to run the blob storage export now? This will export all data since the last sync.",
              )
            )
              mutRunNow.mutate({ projectId });
          }}
        >
          Run Now
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isPending}
          disabled={isLoading || !!!state}
          onClick={() => {
            if (
              confirm(
                "Are you sure you want to reset the Blob Storage integration for this project?",
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
