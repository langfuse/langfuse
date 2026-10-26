/* eslint-disable no-nested-ternary */
import { type UseFormSetValue, useWatch } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  BlobStorageIntegrationType,
  GCS_USE_DEFAULT_CREDENTIALS,
} from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import {
  type BlobStorageFormControl,
  type BlobStorageFormValues,
} from "@/src/features/blobstorage-integration/components/formValues";

// Provider selection plus the connection fields whose labels and visibility
// depend on it: bucket/container, endpoint, region, path style, credentials,
// and prefix.
export const StorageProviderFields = ({
  control,
  setValue,
}: {
  control: BlobStorageFormControl;
  setValue: UseFormSetValue<BlobStorageFormValues>;
}) => {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  // Check if this is a self-hosted instance (no cloud region set)
  const isSelfHosted = !isLangfuseCloud;
  const integrationType =
    useWatch({ control, name: "type" }) ?? BlobStorageIntegrationType.S3;
  const isGcs = integrationType === "GOOGLE_CLOUD_STORAGE";
  const secretAccessKey = useWatch({ control, name: "secretAccessKey" });
  const isGcsDefaultCredentials =
    isGcs && secretAccessKey === GCS_USE_DEFAULT_CREDENTIALS;

  return (
    <>
      <FormField
        control={control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Storage Provider</FormLabel>
            <FormControl>
              <SelectInput
                value={field.value}
                onValueChange={(value) => {
                  // A GCS key (or the ADC sentinel) is not an S3/Azure secret,
                  // and vice versa.
                  if ((value === "GOOGLE_CLOUD_STORAGE") !== isGcs) {
                    setValue("secretAccessKey", "", { shouldDirty: true });
                  }
                  field.onChange(value);
                }}
                placeholder="Select provider"
                options={[
                  { value: BlobStorageIntegrationType.S3, label: "Amazon S3" },
                  {
                    value: BlobStorageIntegrationType.S3_COMPATIBLE,
                    label: "S3 Compatible Storage",
                  },
                  {
                    value: BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
                    label: "Azure Blob Storage",
                  },
                  {
                    value: BlobStorageIntegrationType.GOOGLE_CLOUD_STORAGE,
                    label: "Google Cloud Storage",
                  },
                ]}
              />
            </FormControl>
            <FormDescription>
              Choose your cloud storage provider
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
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
                ? "Azure container name (3-63 chars, lowercase letters, numbers, and hyphens only)"
                : isGcsDefaultCredentials
                  ? "GCS bucket name. With default credentials it must be listed in LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS"
                  : isGcs
                    ? "GCS bucket name"
                    : "The S3 bucket name"}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Endpoint URL field - Only shown for S3-compatible and Azure */}
      {integrationType !== "S3" && !isGcs && (
        <FormField
          control={control}
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

      {/* Region field - Only shown for Amazon S3 or compatible storage */}
      {integrationType !== "AZURE_BLOB_STORAGE" && !isGcs && (
        <FormField
          control={control}
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
                  : "S3 compatible storage region (e.g. europe-west1, auto)"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Force Path Style switch - Only shown for S3-compatible */}
      {integrationType === "S3_COMPATIBLE" && (
        <FormField
          control={control}
          name="forcePathStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Force Path Style</FormLabel>
              <FormControl>
                <div className="mt-1 ml-4">
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              </FormControl>
              <FormDescription>
                Enable for MinIO and some other S3 compatible providers
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* GCS credentials: service account JSON key, or (self-hosted) default
          credentials, mirroring the Vertex AI LLM connection form. */}
      {isGcs && isSelfHosted && (
        <FormField
          control={control}
          name="secretAccessKey"
          render={({ field }) => (
            <FormItem>
              <span className="flex">
                <span className="flex-1">
                  <FormLabel>
                    Use Application Default Credentials (ADC)
                  </FormLabel>
                  <FormDescription>
                    Write as this deployment&apos;s own GCP identity instead of
                    a service account key. The bucket must be listed in
                    LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS.
                  </FormDescription>
                </span>
                <FormControl>
                  <Switch
                    checked={field.value === GCS_USE_DEFAULT_CREDENTIALS}
                    onCheckedChange={(checked) =>
                      field.onChange(checked ? GCS_USE_DEFAULT_CREDENTIALS : "")
                    }
                  />
                </FormControl>
              </span>
            </FormItem>
          )}
        />
      )}
      {isGcs && !isGcsDefaultCredentials && (
        <FormField
          control={control}
          name="secretAccessKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>GCP Service Account Key (JSON)</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder='{"type": "service_account", ...}'
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormDescription>
                Stored encrypted. Leave empty to keep the saved key. The key
                needs write access to the bucket.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* S3/Azure credentials */}
      {!isGcs && (
        <FormField
          control={control}
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
      )}

      {!isGcs && (
        <FormField
          control={control}
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
      )}

      <FormField
        control={control}
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
    </>
  );
};
