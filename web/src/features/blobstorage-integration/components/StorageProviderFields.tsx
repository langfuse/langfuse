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
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
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
import { useTranslations } from "next-intl";

// Provider selection plus the connection fields whose labels and visibility
// depend on it: bucket/container, endpoint, region, path style, credentials,
// and prefix.
export const StorageProviderFields = ({
  control,
}: {
  control: BlobStorageFormControl;
}) => {
  const t = useTranslations("integrationsSettings.blobStorage.provider");
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
            <FormLabel>{t("label")}</FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S3">AWS S3</SelectItem>
                  <SelectItem value="S3_COMPATIBLE">
                    {t("s3Compatible")}
                  </SelectItem>
                  <SelectItem value="AZURE_BLOB_STORAGE">
                    Azure Blob Storage
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            <FormDescription>{t("description")}</FormDescription>
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
                ? t("containerName")
                : t("bucketName")}
            </FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>
              {integrationType === "AZURE_BLOB_STORAGE"
                ? t("azureContainerDescription")
                : t("s3BucketDescription")}
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
              <FormLabel>{t("endpoint")}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ""} />
              </FormControl>
              <FormDescription>
                {integrationType === "AZURE_BLOB_STORAGE"
                  ? t("azureEndpointDescription")
                  : t("s3EndpointDescription")}
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
              <FormLabel>{t("region")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {integrationType === "S3"
                  ? t("awsRegionDescription")
                  : t("s3RegionDescription")}
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
              <FormLabel>{t("forcePathStyle")}</FormLabel>
              <FormControl>
                <div className="mt-1 ml-4">
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              </FormControl>
              <FormDescription>
                {t("forcePathStyleDescription")}
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
                ? t("storageAccountName")
                : integrationType === "S3"
                  ? t("awsAccessKeyId")
                  : t("accessKeyId")}
              {/* Show optional indicator for S3 types on self-hosted instances with entitlement */}
              {isSelfHosted && integrationType === "S3" && (
                <span className="text-muted-foreground">
                  {" "}
                  ({t("optional")})
                </span>
              )}
            </FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>
              {integrationType === "AZURE_BLOB_STORAGE"
                ? t("azureAccountNameDescription")
                : integrationType === "S3"
                  ? isSelfHosted
                    ? t("awsAccessKeySelfHostedDescription")
                    : t("awsAccessKeyDescription")
                  : t("s3AccessKeyDescription")}
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
                ? t("storageAccountKey")
                : integrationType === "S3"
                  ? t("awsSecretAccessKey")
                  : t("secretAccessKey")}
              {/* Show optional indicator for S3 types on self-hosted instances with entitlement */}
              {isSelfHosted && integrationType === "S3" && (
                <span className="text-muted-foreground">
                  {" "}
                  ({t("optional")})
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
                ? t("azureAccountKeyDescription")
                : integrationType === "S3"
                  ? isSelfHosted
                    ? t("awsSecretSelfHostedDescription")
                    : t("awsSecretDescription")
                  : t("s3SecretDescription")}
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
            <FormLabel>{t("prefix")}</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormDescription>
              {integrationType === "AZURE_BLOB_STORAGE"
                ? t("azurePrefixDescription")
                : integrationType === "S3"
                  ? t("s3PrefixDescription")
                  : t("prefixDescription")}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};
