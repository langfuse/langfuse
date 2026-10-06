import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";

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
import {
  externalMediaStorageFormSchema,
  type ExternalMediaStorageFormValues,
} from "@/src/features/external-media-storage/types";

export function ExternalMediaStorageForm({
  formId,
  initialValues,
  secretAccessKeyDisplay,
  onSubmit,
  renderActions,
}: {
  formId: string;
  initialValues: ExternalMediaStorageFormValues;
  secretAccessKeyDisplay: string | null | undefined;
  onSubmit: (values: ExternalMediaStorageFormValues) => void;
  renderActions?: (state: { isDirty: boolean }) => ReactNode;
}) {
  const form = useForm({
    resolver: zodResolver(externalMediaStorageFormSchema),
    defaultValues: initialValues,
  });
  const type = useWatch({ control: form.control, name: "type" }) ?? "S3";

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
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormLabel>Enabled</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="accessKeyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Key ID</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                    Leave empty to keep the saved secret.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
