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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  blobStorageIntegrationFormSchema,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@tremor/react";
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
  type BlobStorageIntegration,
} from "@langfuse/shared";

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
              href="https://langfuse.com/docs/query-traces#blob-storage"
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
  const [integrationType, setIntegrationType] =
    useState<BlobStorageIntegrationType>(BlobStorageIntegrationType.S3);

  // Check if this is a self-hosted instance (no cloud region set)
  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

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
    },
    disabled: isLoading,
  });

  useEffect(() => {
    setIntegrationType(state?.type || BlobStorageIntegrationType.S3);
    blobStorageForm.reset({
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
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
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

        {/* Region field - Only shown for AWS S3 */}
        {integrationType === "S3" && (
          <FormField
            control={blobStorageForm.control}
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Region</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>AWS region (e.g., us-east-1)</FormDescription>
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
          loading={mut.isLoading}
          onClick={blobStorageForm.handleSubmit(onSubmit)}
          disabled={isLoading}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          loading={mutValidate.isLoading}
          disabled={isLoading || !state}
          title="Test your saved configuration by uploading a small test file to your storage"
          onClick={() => {
            mutValidate.mutate({ projectId });
          }}
        >
          Validate
        </Button>
        <Button
          variant="secondary"
          loading={mutRunNow.isLoading}
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
          loading={mutDelete.isLoading}
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
