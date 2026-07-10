import { useWatch } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { PasswordInput } from "@/src/components/ui/password-input";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { BlobStorageIntegrationType } from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { type BlobStorageFormControl } from "@/src/features/blobstorage-integration/components/formValues";

// Provider selection plus the connection fields whose labels and visibility
// depend on it: bucket/container, endpoint, region, path style, credentials,
// and prefix.
export const StorageProviderFields = ({
  control,
}: {
  control: BlobStorageFormControl;
}) => {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  // Check if this is a self-hosted instance (no cloud region set)
  const isSelfHosted = !isLangfuseCloud;
  const integrationType =
    useWatch({ control, name: "type" }) ?? BlobStorageIntegrationType.S3;

  return (
    <>
      <FormField
        control={control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Storage Provider</FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
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
                : "The S3 bucket name"}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Endpoint URL field - Only shown for S3-compatible and Azure */}
      {integrationType !== "S3" && (
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

      {/* Region field - Only shown for AWS S3 or compatible storage */}
      {integrationType !== "AZURE_BLOB_STORAGE" && (
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
