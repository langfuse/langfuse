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
import { useTranslation } from "react-i18next";

export default function BlobStorageIntegrationSettings() {
  const { t } = useTranslation();
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
        title: t("project.settings.integrations.blobStorage.title"),
        breadcrumb: [
          {
            name: t("common.labels.settings"),
            href: `/project/${projectId}/settings`,
          },
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
        {t("project.settings.integrations.blobStorage.description")}
      </p>
      {!hasAccess && (
        <p className="text-sm">
          {t("project.settings.integrations.blobStorage.errors.noAccess")}
        </p>
      )}
      {hasAccess && (
        <>
          <Header
            title={t("project.settings.integrations.blobStorage.configuration")}
          />
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
          <Header
            title={t("project.settings.integrations.blobStorage.statusLabel")}
            className="mt-8"
          />
          <div className="space-y-2">
            <p className="text-sm text-primary">
              {t(
                "project.settings.integrations.blobStorage.status.dataLastExported",
              )}{" "}
              {state.data?.lastSyncAt
                ? new Date(state.data.lastSyncAt).toLocaleString()
                : t(
                    "project.settings.integrations.blobStorage.status.neverPending",
                  )}
            </p>
            <p className="text-sm text-primary">
              {t("project.settings.integrations.blobStorage.status.exportMode")}{" "}
              {state.data?.exportMode === BlobStorageExportMode.FULL_HISTORY
                ? t("project.settings.integrations.blobStorage.fullHistory")
                : state.data?.exportMode === BlobStorageExportMode.FROM_TODAY
                  ? t("project.settings.integrations.blobStorage.fromSetupDate")
                  : state.data?.exportMode ===
                      BlobStorageExportMode.FROM_CUSTOM_DATE
                    ? t(
                        "project.settings.integrations.blobStorage.fromCustomDate",
                      )
                    : t("project.settings.integrations.blobStorage.unknown")}
            </p>
            {(state.data?.exportMode ===
              BlobStorageExportMode.FROM_CUSTOM_DATE ||
              state.data?.exportMode === BlobStorageExportMode.FROM_TODAY) &&
              state.data?.exportStartDate && (
                <p className="text-sm text-primary">
                  {t(
                    "project.settings.integrations.blobStorage.status.exportStartDate",
                  )}{" "}
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
  const { t } = useTranslation();
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
      showErrorToast(
        t("project.settings.integrations.blobStorage.errors.validationFailed"),
        error.message,
      );
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
              <FormLabel>
                {t(
                  "project.settings.integrations.blobStorage.form.storageProvider",
                )}
              </FormLabel>
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
                    <SelectValue
                      placeholder={t(
                        "project.settings.integrations.blobStorage.selectOptions.selectProvider",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S3">
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.awsS3",
                      )}
                    </SelectItem>
                    <SelectItem value="S3_COMPATIBLE">
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.s3Compatible",
                      )}
                    </SelectItem>
                    <SelectItem value="AZURE_BLOB_STORAGE">
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.azureBlobStorage",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                {t(
                  "project.settings.integrations.blobStorage.form.chooseProvider",
                )}
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
                  ? t(
                      "project.settings.integrations.blobStorage.form.containerName",
                    )
                  : t(
                      "project.settings.integrations.blobStorage.form.bucketName",
                    )}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? t(
                      "project.settings.integrations.blobStorage.form.azureContainerDescription",
                    )
                  : t(
                      "project.settings.integrations.blobStorage.form.s3BucketDescription",
                    )}
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
                <FormLabel>
                  {t(
                    "project.settings.integrations.blobStorage.form.endpointUrl",
                  )}
                </FormLabel>
                <FormControl>
                  <Input {...field} value={field.value || ""} />
                </FormControl>
                <FormDescription>
                  {integrationType === "AZURE_BLOB_STORAGE"
                    ? t(
                        "project.settings.integrations.blobStorage.form.azureEndpointDescription",
                      )
                    : t(
                        "project.settings.integrations.blobStorage.form.s3EndpointDescription",
                      )}
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
                <FormLabel>
                  {t("project.settings.integrations.blobStorage.form.region")}
                </FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  {t(
                    "project.settings.integrations.blobStorage.form.regionDescription",
                  )}
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
                <FormLabel>
                  {t(
                    "project.settings.integrations.blobStorage.form.forcePathStyle",
                  )}
                </FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="ml-4 mt-1"
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    "project.settings.integrations.blobStorage.form.forcePathStyleDescription",
                  )}
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
                  ? t(
                      "project.settings.integrations.blobStorage.form.storageAccountName",
                    )
                  : integrationType === "S3"
                    ? t(
                        "project.settings.integrations.blobStorage.form.awsAccessKeyId",
                      )
                    : t(
                        "project.settings.integrations.blobStorage.form.accessKeyId",
                      )}
                {/* Show optional indicator for S3 types on self-hosted instances with entitlement */}
                {isSelfHosted && integrationType === "S3" && (
                  <span className="text-muted-foreground">
                    {" "}
                    {t("common.labels.optional")}
                  </span>
                )}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? t(
                      "project.settings.integrations.blobStorage.form.azureAccountDescription",
                    )
                  : integrationType === "S3"
                    ? isSelfHosted
                      ? t(
                          "project.settings.integrations.blobStorage.form.awsAccessKeySelfHostedDescription",
                        )
                      : t(
                          "project.settings.integrations.blobStorage.form.awsAccessKeyDescription",
                        )
                    : t(
                        "project.settings.integrations.blobStorage.form.s3AccessKeyDescription",
                      )}
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
                  ? t(
                      "project.settings.integrations.blobStorage.form.storageAccountKey",
                    )
                  : integrationType === "S3"
                    ? t(
                        "project.settings.integrations.blobStorage.form.awsSecretAccessKey",
                      )
                    : t(
                        "project.settings.integrations.blobStorage.form.secretAccessKey",
                      )}
                {/* Show optional indicator for S3 types on self-hosted instances with entitlement */}
                {isSelfHosted && integrationType === "S3" && (
                  <span className="text-muted-foreground">
                    {" "}
                    {t("common.labels.optional")}
                  </span>
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
                  ? t(
                      "project.settings.integrations.blobStorage.form.azureSecretDescription",
                    )
                  : integrationType === "S3"
                    ? isSelfHosted
                      ? t(
                          "project.settings.integrations.blobStorage.form.awsSecretSelfHostedDescription",
                        )
                      : t(
                          "project.settings.integrations.blobStorage.form.awsSecretDescription",
                        )
                    : t(
                        "project.settings.integrations.blobStorage.form.s3SecretDescription",
                      )}
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
              <FormLabel>
                {t(
                  "project.settings.integrations.blobStorage.form.exportPrefix",
                )}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? t(
                      "project.settings.integrations.blobStorage.form.azurePrefixDescription",
                    )
                  : integrationType === "S3"
                    ? t(
                        "project.settings.integrations.blobStorage.form.s3PrefixDescription",
                      )
                    : t(
                        "project.settings.integrations.blobStorage.form.genericPrefixDescription",
                      )}
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
              <FormLabel>
                {t(
                  "project.settings.integrations.blobStorage.form.exportFrequency",
                )}
              </FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "project.settings.integrations.blobStorage.selectOptions.selectFrequency",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.hourly",
                      )}
                    </SelectItem>
                    <SelectItem value="daily">
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.daily",
                      )}
                    </SelectItem>
                    <SelectItem value="weekly">
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.weekly",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                {t(
                  "project.settings.integrations.blobStorage.form.frequencyDescription",
                )}
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
              <FormLabel>
                {t("project.settings.integrations.blobStorage.form.fileType")}
              </FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "project.settings.integrations.blobStorage.selectOptions.selectFileType",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JSONL">JSONL</SelectItem>
                    <SelectItem value="CSV">CSV</SelectItem>
                    <SelectItem value="JSON">JSON</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                {t(
                  "project.settings.integrations.blobStorage.form.fileTypeDescription",
                )}
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
              <FormLabel>
                {t("project.settings.integrations.blobStorage.form.exportMode")}
              </FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "project.settings.integrations.blobStorage.selectOptions.selectExportMode",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BlobStorageExportMode.FULL_HISTORY}>
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.fullHistory",
                      )}
                    </SelectItem>
                    <SelectItem value={BlobStorageExportMode.FROM_TODAY}>
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.today",
                      )}
                    </SelectItem>
                    <SelectItem value={BlobStorageExportMode.FROM_CUSTOM_DATE}>
                      {t(
                        "project.settings.integrations.blobStorage.selectOptions.customDate",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                {t(
                  "project.settings.integrations.blobStorage.form.exportModeDescription",
                )}
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
                <FormLabel>
                  {t(
                    "project.settings.integrations.blobStorage.form.exportStartDate",
                  )}
                </FormLabel>
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
                    placeholder={t(
                      "project.settings.integrations.blobStorage.selectOptions.selectStartDate",
                    )}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    "project.settings.integrations.blobStorage.form.startDateDescription",
                  )}
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
              <FormLabel>
                {t("project.settings.integrations.blobStorage.form.enabled")}
              </FormLabel>
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
          {t("common.actions.save")}
        </Button>
        <Button
          variant="secondary"
          loading={mutValidate.isPending}
          disabled={isLoading || !state}
          title={t("project.integrations.blobStorage.testSavedConfiguration")}
          onClick={() => {
            mutValidate.mutate({ projectId });
          }}
        >
          {t("common.actions.validate")}
        </Button>
        <Button
          variant="secondary"
          loading={mutRunNow.isPending}
          disabled={isLoading || !state?.enabled}
          title={t("project.integrations.blobStorage.triggerImmediateExport")}
          onClick={() => {
            if (
              confirm(
                t("project.integrations.blobStorage.areYouSureRunBlobStorage"),
              )
            )
              mutRunNow.mutate({ projectId });
          }}
        >
          {t("common.actions.runNow")}
        </Button>
        <Button
          variant="ghost"
          loading={mutDelete.isPending}
          disabled={isLoading || !!!state}
          onClick={() => {
            if (
              confirm(
                t(
                  "project.integrations.blobStorage.areYouSureResetBlobStorage",
                ),
              )
            )
              mutDelete.mutate({ projectId });
          }}
        >
          {t("common.actions.reset")}
        </Button>
      </div>
    </Form>
  );
};
