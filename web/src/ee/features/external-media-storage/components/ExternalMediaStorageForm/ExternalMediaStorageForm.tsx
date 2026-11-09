import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { STORAGE_ROLE_READ_ACTIONS } from "@langfuse/shared";

import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Card } from "@/src/components/ui/card";
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
import { RoleAuthSetupSection } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupSection";
import { RoleAuthSetupInstructions } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupInstructions";
import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import {
  externalMediaStorageFormSchema,
  type ExternalMediaStorageFormValues,
} from "@/src/ee/features/external-media-storage/types";

export function ExternalMediaStorageForm({
  formId,
  initialValues,
  secretAccessKeyDisplay,
  crossAccountRoleArn,
  externalId,
  onSubmit,
  renderActions,
}: {
  formId: string;
  initialValues: ExternalMediaStorageFormValues;
  secretAccessKeyDisplay: string | null | undefined;
  /** Null when this deployment does not support IAM role auth. */
  crossAccountRoleArn: string | null;
  externalId: RevealableExternalId;
  onSubmit: (values: ExternalMediaStorageFormValues) => void;
  renderActions?: (state: { isDirty: boolean }) => ReactNode;
}) {
  const form = useForm({
    resolver: zodResolver(externalMediaStorageFormSchema),
    defaultValues: initialValues,
  });
  const type = useWatch({ control: form.control, name: "type" }) ?? "S3";
  const authType =
    useWatch({ control: form.control, name: "authType" }) ?? "ACCESS_KEYS";
  const [roleArn, bucketName, prefix] = useWatch({
    control: form.control,
    name: ["roleArn", "bucketName", "prefix"],
  });
  const canChooseAuthType =
    type === "S3" && (crossAccountRoleArn !== null || authType === "ROLE_ARN");

  return (
    <Form {...form}>
      <>
        <Card className="p-3">
          <form
            id={formId}
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Storage Provider</FormLabel>
                  <FormControl>
                    <SelectInput
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value === "S3") {
                          form.setValue("endpoint", null);
                          form.setValue("forcePathStyle", false);
                        } else {
                          form.setValue("authType", "ACCESS_KEYS");
                        }
                      }}
                      placeholder="Select a storage provider"
                      options={[
                        {
                          value: "S3",
                          label: "Amazon S3",
                        },
                        {
                          value: "S3_COMPATIBLE",
                          label: "S3 Compatible Storage",
                        },
                      ]}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {canChooseAuthType ? (
              <FormField
                control={form.control}
                name="authType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authentication</FormLabel>
                    <FormControl>
                      <SelectInput
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select an authentication method"
                        options={[
                          { value: "ACCESS_KEYS", label: "Access keys" },
                          { value: "ROLE_ARN", label: "IAM role" },
                        ]}
                      />
                    </FormControl>
                    <FormDescription>
                      With an IAM role, Langfuse assumes a role in your AWS
                      account instead of storing access keys.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="bucketName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bucket Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    The S3 bucket containing media.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {type === "S3_COMPATIBLE" ? (
              <>
                <FormField
                  control={form.control}
                  name="endpoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endpoint URL</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription>
                        The endpoint for your S3-compatible storage.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forcePathStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Force Path Style</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Enable for MinIO and providers requiring path-style
                        URLs.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}

            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    AWS or S3-compatible storage region.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {authType === "ROLE_ARN" ? (
              <FormField
                control={form.control}
                name="roleArn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role ARN</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="arn:aws:iam::123456789012:role/langfuse-media"
                      />
                    </FormControl>
                    <FormDescription>
                      The role in your AWS account that can read media objects.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {authType === "ROLE_ARN" && crossAccountRoleArn ? (
              <div className="-mt-2">
                <RoleAuthSetupSection>
                  <RoleAuthSetupInstructions
                    crossAccountRoleArn={crossAccountRoleArn}
                    externalId={externalId}
                    roleArn={roleArn ?? ""}
                    bucketName={bucketName.trim()}
                    prefix={prefix?.trim()}
                    actions={STORAGE_ROLE_READ_ACTIONS}
                    description="Let the Langfuse cross-account role assume your role with this external ID, then grant the role read access to the bucket. If the bucket uses SSE-KMS, also allow the role to use kms:Decrypt on the key."
                  />
                </RoleAuthSetupSection>
              </div>
            ) : null}
            {authType === "ROLE_ARN" ? null : (
              <>
                <FormField
                  control={form.control}
                  name="accessKeyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Key ID</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription>
                        Access key used to read media objects.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secretAccessKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secret Access Key</FormLabel>
                      <FormControl>
                        <PasswordInput
                          {...field}
                          value={field.value ?? ""}
                          placeholder={
                            secretAccessKeyDisplay ?? "********************"
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Leave empty to keep the saved secret, unless you change
                        the storage provider, bucket, endpoint, or Access Key
                        ID.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Media Prefix{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>
                    Restrict media access to this path, for example
                    &quot;langfuse-media/&quot;.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Card>
        {renderActions ? (
          <div className="mt-3 flex justify-end gap-2">
            {renderActions({ isDirty: form.formState.isDirty })}
          </div>
        ) : null}
      </>
    </Form>
  );
}
