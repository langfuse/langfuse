/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-use-before-define -- Legacy UI usage retained during migration to design-system components. */
import { Form } from "@/src/components/design-system/Form/Form";
import { Button } from "@/src/components/ui/button";
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

      <div>
        <h3 className="text-sm font-bold">Headers</h3>

        {/* Default Headers Section */}
        <div className="mb-4">
          <p className="text-muted-foreground mb-2 text-sm">
            Default headers (automatically added by Langfuse):
          </p>
          <dl className="bg-muted/50 space-y-1 rounded-md p-3 font-mono text-xs">
            {Object.entries({
              ...WebhookDefaultHeaders,
              "x-langfuse-signature": "t=<timestamp>,v1=<signature>",
            }).map(([name, value]) => (
              <div key={name} className="grid grid-cols-2 gap-2 wrap-anywhere">
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Custom Headers Section */}
        <p className="text-muted-foreground mb-2 text-sm">
          Optional custom headers to include in the webhook request:
        </p>

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
              className="mb-2 grid grid-cols-[1fr_1fr_auto_auto] gap-2"
            >
              <Form.InputField
                control={form.control}
                name={`webhook.headers.${originalIndex}.name`}
                label="Header Name"
                placeholder="Header Name"
                disabled={disabled}
              />
              <Form.InputField
                control={form.control}
                name={`webhook.headers.${originalIndex}.value`}
                label="Value"
                placeholder={valuePlaceholder}
                disabled={disabled}
                type={isSecret ? "password" : "text"}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-5"
                onClick={() => toggleHeaderSecret(originalIndex)}
                disabled={disabled}
                title={isSecret ? "Make header public" : "Make header secret"}
              >
                {isSecret ? (
                  <Lock size="base" __rawClassName="text-orange-500" />
                ) : (
                  <LockOpen size="base" color="muted" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-5"
                onClick={() => removeHeader(originalIndex)}
                disabled={disabled}
                aria-label="Remove header"
              >
                <X size="base" color="default" />
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addHeader}
          disabled={disabled}
          className="mt-2"
        >
          <Plus size="base" color="default" __rawClassName="mr-1" />
          Add Custom Header
        </Button>
      </div>

      {/* Webhook Secret Section */}
      <div>
        <h3 className="text-sm font-bold">Webhook Secret</h3>
        <p className="text-muted-foreground mb-2 text-sm">
          Use this secret to verify webhook signatures for security. The secret
          is automatically included in the x-langfuse-signature header.
        </p>

        {action?.id ? (
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CodeSection
                  variant="outline"
                  content={
                    (action.config as SafeWebhookActionConfig).displaySecretKey
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
            <div className="text-muted-foreground mt-1 text-xs">
              Secret is encrypted and can only be viewed when generated or
              regenerated
            </div>
          </div>
        ) : (
          <div className="bg-muted/50 text-muted-foreground rounded-md border p-3 text-sm">
            Webhook secret will be generated when the automation is created.
          </div>
        )}
      </div>
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
