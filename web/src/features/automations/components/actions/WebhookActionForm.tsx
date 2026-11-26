/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-use-before-define -- Legacy UI usage retained during migration to design-system components. */
import { Form } from "@/src/components/design-system/Form/Form";
import { Button as DesignButton } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { X, Plus, RefreshCw, Lock, LockOpen } from "@langfuse/icons";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  type ActionDomain,
  type ActionDomainWithSecrets,
  type SafeWebhookActionConfig,
  WebhookDefaultHeaders,
  WebhookProtectedHeaders,
} from "@langfuse/shared";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { WebhookSecretRender } from "../WebhookSecretRender";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { areDestinationUrlsEquivalent } from "@/src/features/automations/destinationUrl";
import { cn } from "@/src/utils/tailwind";

export const webhookSchema = z.object({
  url: z.url(),
  headers: z.array(
    z.object({
      name: z.string().refine(
        (name) => {
          if (!name.trim()) return true; // Allow empty names (will be filtered out)
          return !WebhookProtectedHeaders.includes(name.trim().toLowerCase());
        },
        {
          message:
            "This header is automatically added by Langfuse and cannot be customized",
        },
      ),
      value: z.string(),
      displayValue: z.string(),
      isSecret: z.boolean(),
      wasSecret: z.boolean(),
    }),
  ),
  originalUrl: z.string().optional(),
});

interface WebhookActionFormProps {
  form: UseFormReturn<{ webhook: z.infer<typeof webhookSchema> }>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain | ActionDomainWithSecrets;
}

export const WebhookActionForm: React.FC<WebhookActionFormProps> = ({
  form,
  disabled,
  projectId,
  action,
}) => {
  const {
    fields: headerFields,
    append: appendHeader,
    remove: removeHeader,
  } = useFieldArray({
    control: form.control,
    name: "webhook.headers",
  });

  const currentUrl = form.watch("webhook.url");
  const originalUrl = form.watch("webhook.originalUrl");
  const isUrlChanged =
    originalUrl !== undefined &&
    !areDestinationUrlsEquivalent(currentUrl, originalUrl);

  // Filter out headers managed by Langfuse from the user-editable headers
  const customHeaderFields = headerFields.filter((field, index) => {
    const headerName = form.watch(`webhook.headers.${index}.name`);
    return !WebhookProtectedHeaders.includes(headerName?.toLowerCase());
  });

  // Function to add a new header pair
  const addHeader = () => {
    appendHeader({
      name: "",
      value: "",
      displayValue: "",
      isSecret: false,
      wasSecret: false,
    });
  };

  // Function to toggle secret status of a header
  const toggleHeaderSecret = (index: number) => {
    const currentValue = form.watch(`webhook.headers.${index}.isSecret`);
    form.setValue(`webhook.headers.${index}.isSecret`, !currentValue);
  };

  return (
    <div className="space-y-4">
      <Form.InputField
        control={form.control}
        name="webhook.url"
        label="Webhook URL"
        required
        placeholder="https://example.com/webhook"
        disabled={disabled}
        description={`The HTTP URL to call when the trigger fires. We will send a POST request to this URL. Only HTTPS URLs are allowed for security.${
          isUrlChanged
            ? " Re-enter the values of secret headers when changing the URL."
            : ""
        }`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Headers</CardTitle>
          <CardDescription>
            Default headers (automatically added by Langfuse):
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <dl className="space-y-1 text-sm">
            {Object.entries({
              ...WebhookDefaultHeaders,
              "x-langfuse-signature": "t=<timestamp>,v1=<signature>",
            }).map(([name, value]) => (
              <div key={name} className="grid grid-cols-2 gap-2 wrap-anywhere">
                <dt>
                  <code>{name}</code>
                </dt>
                <dd>
                  <code>{value}</code>
                </dd>
              </div>
            ))}
          </dl>
          <CardDescription>
            Optional custom headers to include in the webhook request:
          </CardDescription>

          {customHeaderFields.map((field) => {
            // Find the original index in the headerFields array
            const originalIndex = headerFields.findIndex(
              (f) => f.id === field.id,
            );
            const isSecret = form.watch(
              `webhook.headers.${originalIndex}.isSecret`,
            );
            const displayValue = form.watch(
              `webhook.headers.${originalIndex}.displayValue`,
            );
            const wasSecret = form.watch(
              `webhook.headers.${originalIndex}.wasSecret`,
            );
            const valuePlaceholder =
              wasSecret && isUrlChanged
                ? "Re-enter secret value"
                : displayValue || "Value";

            return (
              <div
                key={field.id}
                className="grid grid-cols-2 items-start gap-2"
              >
                <Form.InputField
                  control={form.control}
                  name={`webhook.headers.${originalIndex}.name`}
                  label="Header name"
                  placeholder="Header name"
                  disabled={disabled}
                />
                <Form.Field
                  control={form.control}
                  name={`webhook.headers.${originalIndex}.value`}
                  label="Value"
                >
                  {(valueField) => (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                      <Input
                        id={valueField.id}
                        name={valueField.name}
                        ref={valueField.ref}
                        value={valueField.value}
                        onChange={valueField.onChange}
                        onBlur={valueField.onBlur}
                        aria-describedby={valueField.inputDescribedById}
                        aria-invalid={Boolean(valueField.error)}
                        error={Boolean(valueField.error)}
                        placeholder={valuePlaceholder}
                        disabled={disabled}
                        type={isSecret ? "password" : "text"}
                      />
                      <IconButton
                        icon={isSecret ? Lock : LockOpen}
                        label="Secret header"
                        aria-pressed={isSecret}
                        title={
                          isSecret ? "Make header public" : "Make header secret"
                        }
                        onClick={() => toggleHeaderSecret(originalIndex)}
                        disabled={disabled}
                      />
                      <IconButton
                        icon={X}
                        label="Remove header"
                        onClick={() => removeHeader(originalIndex)}
                        disabled={disabled}
                      />
                    </div>
                  )}
                </Form.Field>
              </div>
            );
          })}

          <DesignButton
            variant="outline"
            onClick={addHeader}
            disabled={disabled}
            icon={Plus}
            text="Add custom header"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook secret</CardTitle>
          <CardDescription>
            Use this secret to verify webhook signatures for security. The
            secret is automatically included in the x-langfuse-signature header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {action?.id ? (
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CodeSection
                    variant="outline"
                    content={
                      (action.config as SafeWebhookActionConfig)
                        .displaySecretKey
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <RegenerateWebhookSecretButton
                    projectId={projectId}
                    action={action}
                  />
                </div>
              </div>
              <CardDescription>
                Secret is encrypted and can only be viewed when generated or
                regenerated
              </CardDescription>
            </div>
          ) : (
            <Banner>
              Webhook secret will be generated when the automation is created.
            </Banner>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const RegenerateWebhookSecretButton = ({
  projectId,
  action,
}: {
  projectId: string;
  action: ActionDomain | ActionDomainWithSecrets;
}) => {
  const [showConfirmPopover, setShowConfirmPopover] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(
    null,
  );

  const utils = api.useUtils();
  const regenerateSecretMutation =
    api.automations.regenerateWebhookSecret.useMutation({
      onSuccess: (data) => {
        showSuccessToast({
          operation: "webhook_secret.regenerate",
          title: "Webhook Secret Regenerated",
          description: "Your webhook secret has been successfully regenerated.",
        });
        setRegeneratedSecret(data.webhookSecret);
        setShowRegenerateDialog(true);
        utils.automations.invalidate();
      },
    });

  // Function to regenerate webhook secret
  const handleRegenerateSecret = async () => {
    if (!action?.id) return;
    try {
      await regenerateSecretMutation.mutateAsync({
        projectId,
        actionId: action.id,
      });
      setShowConfirmPopover(false);
    } catch (error) {
      reportNonTrpcError(error, "automations");
    }
  };

  return (
    <>
      <Popover open={showConfirmPopover} onOpenChange={setShowConfirmPopover}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={regenerateSecretMutation.isPending}
          >
            <RefreshCw
              size="base"
              color="default"
              __rawClassName={cn(
                "mr-2",
                regenerateSecretMutation.isPending && "animate-spin",
              )}
            />
            Regenerate
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <h2 className="mb-3 font-bold">Please confirm</h2>
          <p className="mb-3 max-w-sm text-sm">
            This action will invalidate the current webhook secret and generate
            a new one. Any existing integrations using the old secret will stop
            working until updated.
          </p>
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmPopover(false)}
              disabled={regenerateSecretMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={regenerateSecretMutation.isPending}
              onClick={handleRegenerateSecret}
            >
              Regenerate Secret
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Regenerate Secret Dialog */}
      <Dialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Webhook Secret Regenerated</DialogTitle>
            <DialogDescription>
              Your webhook secret has been regenerated. Please copy the new
              secret below - it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {regeneratedSecret && (
              <WebhookSecretRender webhookSecret={regeneratedSecret} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowRegenerateDialog(false);
                setRegeneratedSecret(null);
              }}
            >
              {"I've saved the secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Function to convert the array of header objects to a Record for API
export const formatWebhookHeaders = (
  headers: {
    name: string;
    value: string;
    displayValue: string;
    isSecret: boolean;
    wasSecret: boolean;
  }[],
): Record<string, { secret: boolean; value: string }> => {
  const requestHeaders: Record<string, { secret: boolean; value: string }> = {};
  headers.forEach((header) => {
    if (header.name.trim()) {
      // Exclude managed headers; they are added automatically by the API.
      if (!WebhookProtectedHeaders.includes(header.name.trim().toLowerCase())) {
        requestHeaders[header.name.trim()] = {
          secret: header.isSecret || false,
          value: header.value.trim(),
        };
      }
    }
  });

  return requestHeaders;
};
