import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Lock, LockOpen, Plus, X } from "@langfuse/icons";

import {
  WebhookContentTypeHeader,
  WebhookDefaultHeaders,
  WebhookSignatureHeader,
  WebhookUserAgentHeader,
} from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { type MonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";
import { stripUrlScheme } from "../helpers/stripUrlScheme";
import { FieldGroup } from "./FieldGroup";
import { PrefixedInput } from "./PrefixedInput";

const defaultHeaders = [
  {
    name: WebhookContentTypeHeader,
    value: WebhookDefaultHeaders[WebhookContentTypeHeader],
  },
  {
    name: WebhookUserAgentHeader,
    value: WebhookDefaultHeaders[WebhookUserAgentHeader],
  },
  { name: WebhookSignatureHeader, value: "t=<timestamp>,v1=<signature>" },
];

/** WebhookActionFields collects the https endpoint and the custom request headers. */
export function WebhookActionFields({
  form,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
}) {
  return (
    <>
      <WebhookUrlField form={form} />
      <WebhookHeadersField form={form} />
    </>
  );
}

/** WebhookUrlField takes the host and path; the https scheme is fixed in the prefix. */
function WebhookUrlField({
  form,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
}) {
  return (
    <Form.Field
      control={form.control}
      name="webhook.url"
      label="Webhook URL"
      description="Called whenever the severity changes."
    >
      {(field) => (
        <PrefixedInput
          id={field.id}
          name={field.name}
          value={field.value}
          onChange={(event) =>
            field.onChange(stripUrlScheme(event.target.value))
          }
          onBlur={field.onBlur}
          ref={field.ref}
          addon="POST"
          prefix="https://"
          inputMode="url"
          placeholder="example.com/webhook"
          aria-describedby={field.inputDescribedById}
          aria-invalid={!!field.error}
          error={!!field.error}
        />
      )}
    </Form.Field>
  );
}

/** WebhookHeadersField shows the headers Langfuse adds and edits the custom ones. */
function WebhookHeadersField({
  form,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
}) {
  const headers = useFieldArray({
    control: form.control,
    name: "webhook.headers",
  });

  return (
    <FieldGroup label="Headers">
      <p className="text-muted-foreground text-sm">
        Default headers (automatically added by Langfuse):
      </p>
      {defaultHeaders.map((header) => (
        <div key={header.name} className="grid grid-cols-2 gap-2">
          <Input aria-label="Header name" value={header.name} disabled />
          <Input aria-label="Header value" value={header.value} disabled />
        </div>
      ))}
      <p className="text-muted-foreground pt-2 text-sm">
        Optional custom headers to include in the webhook request:
      </p>
      {headers.fields.map((header, index) => (
        <CustomHeaderRow
          key={header.id}
          form={form}
          index={index}
          onRemove={() => headers.remove(index)}
        />
      ))}
      <div className="pt-1">
        <Button
          type="button"
          variant="secondary"
          text="Add custom header"
          icon={Plus}
          onClick={() =>
            headers.append({ name: "", value: "", isSecret: false })
          }
        />
      </div>
    </FieldGroup>
  );
}

/** CustomHeaderRow edits one custom header; a locked header is stored as a secret. */
function CustomHeaderRow({
  form,
  index,
  onRemove,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
  index: number;
  onRemove: () => void;
}) {
  const isSecret = form.watch(`webhook.headers.${index}.isSecret`);
  const nameError = form.formState.errors.webhook?.headers?.[index]?.name;
  const valueError = form.formState.errors.webhook?.headers?.[index]?.value;
  const errorMessage = nameError?.message ?? valueError?.message;

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
        <Input
          aria-label="Header name"
          placeholder="Header name"
          error={!!nameError}
          {...form.register(`webhook.headers.${index}.name`)}
        />
        <Input
          aria-label="Header value"
          placeholder="Value"
          type={headerValueInputType(isSecret)}
          error={!!valueError}
          {...form.register(`webhook.headers.${index}.value`)}
        />
        <div className="flex items-center gap-1">
          <IconButton
            icon={lockIcon(isSecret)}
            label={lockLabel(isSecret)}
            aria-pressed={isSecret}
            onClick={() =>
              form.setValue(`webhook.headers.${index}.isSecret`, !isSecret)
            }
          />
          <IconButton icon={X} label="Remove header" onClick={onRemove} />
        </div>
      </div>
      {errorMessage && (
        <p className="text-destructive text-sm">{errorMessage}</p>
      )}
    </div>
  );
}

/** headerValueInputType masks secret header values. */
function headerValueInputType(isSecret: boolean): "password" | "text" {
  if (isSecret) return "password";
  return "text";
}

/** lockIcon shows a closed lock for secret headers. */
function lockIcon(isSecret: boolean) {
  if (isSecret) return Lock;
  return LockOpen;
}

/** lockLabel names what the lock toggle will do. */
function lockLabel(isSecret: boolean): string {
  if (isSecret) return "Make header public";
  return "Make header secret";
}
