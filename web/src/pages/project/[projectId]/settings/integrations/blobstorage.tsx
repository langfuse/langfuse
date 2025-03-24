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
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  blobStorageIntegrationFormSchema,
  StorageProvider,
  type BlobStorageIntegrationFormSchema,
} from "@/src/features/blobstorage-integration/types";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@tremor/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

export default function BlobStorageIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const entitled = useHasEntitlement("integration-blobstorage");
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const state = api.blobStorageIntegration.get.useQuery(
    { projectId },
    {
      enabled: hasAccess && entitled,
    },
  );
  if (!entitled) return null;

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
            <Link href="https://langfuse.com/docs/integrations/blob-storage">
              Integration Docs ↗
            </Link>
          </Button>
        ),
      }}
    >
      <p className="mb-4 text-sm text-primary">
        Configure scheduled exports of your trace data to AWS S3, S3-compatible storages,
        or Azure Blob Storage. Set up a daily, weekly, or monthly export to your
        own storage for data analysis or backup purposes.
      </p>
      {!hasAccess && (
        <p className="text-sm">
          You current role does not grant you access to these settings, please
          reach out to your project admin or owner.
        </p>
      )}
      {hasAccess && (
        <>
          <Header title="Configuration" />
          <Card className="p-3">
            <BlobStorageIntegrationSettingsForm
              state={state.data}
              projectId={projectId}
              isLoading={state.isLoading}
            />
          </Card>
        </>
      )}
      {state.data?.enabled && (
        <>
          <Header title="Status" className="mt-8" />
          <p className="text-sm text-primary">
            Data last exported:{" "}
            {state.data?.lastExportAt
              ? new Date(state.data.lastExportAt).toLocaleString()
              : "Never (pending)"}
          </p>
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
  state?: RouterOutput["blobStorageIntegration"]["get"];
  projectId: string;
  isLoading: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const [storageProvider, setStorageProvider] = useState<StorageProvider>(
    (state?.provider as StorageProvider) || "s3",
  );

  const blobStorageForm = useForm<BlobStorageIntegrationFormSchema>({
    resolver: zodResolver(blobStorageIntegrationFormSchema),
    defaultValues: {
      provider: (state?.provider as StorageProvider) || "s3",
      bucketName: state?.bucketName || "",
      endpoint: state?.endpoint || "",
      region: state?.region || "",
      accessKeyId: state?.accessKeyId || "",
      secretAccessKey: state?.secretAccessKey || "",
      exportPrefix: state?.exportPrefix || "",
      exportFrequency: state?.exportFrequency || "daily",
      enabled: state?.enabled || false,
      forcePathStyle: state?.forcePathStyle || false,
    },
    disabled: isLoading,
  });

  useEffect(() => {
    blobStorageForm.reset({
      provider: (state?.provider as StorageProvider) || "s3",
      bucketName: state?.bucketName || "",
      endpoint: state?.endpoint || "",
      region: state?.region || "",
      accessKeyId: state?.accessKeyId || "",
      secretAccessKey: state?.secretAccessKey || "",
      exportPrefix: state?.exportPrefix || "",
      exportFrequency: state?.exportFrequency || "daily",
      enabled: state?.enabled || false,
      forcePathStyle: state?.forcePathStyle || false,
    });
    setStorageProvider((state?.provider as StorageProvider) || "s3");
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

  async function onSubmit(values: BlobStorageIntegrationFormSchema) {
    capture("integrations:blobstorage_form_submitted");
    mut.mutate({
      projectId,
      ...values,
    });
  }

  const handleProviderChange = (value: StorageProvider) => {
    setStorageProvider(value);
    blobStorageForm.setValue("provider", value);
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
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Storage Provider</FormLabel>
              <FormControl>
                <Select
                  defaultValue={field.value}
                  onValueChange={(value) =>
                    handleProviderChange(value as StorageProvider)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="s3">AWS S3</SelectItem>
                    <SelectItem value="s3-compatible">S3 Compatible Storage</SelectItem>
                    <SelectItem value="azure">Azure Blob Storage</SelectItem>
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
                {storageProvider === "azure" ? "Container Name" : "Bucket Name"}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {storageProvider === "azure"
                  ? "The Azure storage container name"
                  : "The S3 bucket name"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Endpoint URL field - Only shown for S3-compatible and Azure */}
        {storageProvider !== "s3" && (
          <FormField
            control={blobStorageForm.control}
            name="endpoint"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Endpoint URL</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  {storageProvider === "azure"
                    ? "Azure Blob Storage endpoint URL (e.g., https://accountname.blob.core.windows.net)"
                    : "S3 compatible endpoint URL (e.g., https://play.min.io)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Region field - Only shown for AWS S3 */}
        {storageProvider === "s3" && (
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
                  AWS region (e.g., us-east-1)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Force Path Style switch - Only shown for S3-compatible */}
        {storageProvider === "s3-compatible" && (
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
                {storageProvider === "azure"
                  ? "Storage Account Name"
                  : storageProvider === "s3"
                    ? "AWS Access Key ID"
                    : "Access Key ID"}
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {storageProvider === "azure"
                  ? "Your Azure storage account name"
                  : storageProvider === "s3"
                    ? "Your AWS IAM user access key ID"
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
                {storageProvider === "azure"
                  ? "Storage Account Key"
                  : storageProvider === "s3"
                    ? "AWS Secret Access Key"
                    : "Secret Access Key"}
              </FormLabel>
              <FormControl>
                <PasswordInput {...field} />
              </FormControl>
              <FormDescription>
                {storageProvider === "azure"
                  ? "Your Azure storage account access key"
                  : storageProvider === "s3"
                    ? "Your AWS IAM user secret access key"
                    : "Secret key for your S3-compatible storage"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={blobStorageForm.control}
          name="exportPrefix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Export Prefix</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {storageProvider === "azure"
                  ? "Optional prefix path for exported files in your Azure container (e.g., \"langfuse-exports/\")"
                  : storageProvider === "s3"
                    ? "Optional prefix path for exported files in your S3 bucket (e.g., \"langfuse-exports/\")"
                    : "Optional prefix path for exported files (e.g., \"langfuse-exports/\")"}
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
                <Select
                  defaultValue={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                How often the data should be exported
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

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
