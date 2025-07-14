import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { X, Plus, RefreshCw } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod/v4";
import {
  type ActionDomain,
  type ActionDomainWithSecrets,
  AvailableWebhookApiSchema,
  WebhookDefaultHeaders,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
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
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export const webhookSchema = z.object({
  url: z.url(),
  headers: z.array(
    z.object({
      name: z.string().refine(
        (name) => {
          if (!name.trim()) return true; // Allow empty names (will be filtered out)
          const defaultHeaderKeys = Object.keys(WebhookDefaultHeaders);
          return !defaultHeaderKeys.includes(name.trim().toLowerCase());
        },
        {
          message:
            "This header is automatically added by Langfuse and cannot be customized",
        },
      ),
      value: z.string(),
    }),
  ),
  apiVersion: AvailableWebhookApiSchema,
});

export type WebhookFormValues = z.infer<typeof webhookSchema>;

interface WebhookActionFormProps {
  form: UseFormReturn<any>;
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

  // Get default header keys to filter them out
  const defaultHeaderKeys = Object.keys(WebhookDefaultHeaders);

  // Filter out default headers from the user-editable headers
  const customHeaderFields = headerFields.filter((field, index) => {
    const headerName = form.watch(`webhook.headers.${index}.name`);
    return !defaultHeaderKeys.includes(headerName?.toLowerCase());
  });

  // Function to add a new header pair
  const addHeader = () => {
    appendHeader({ name: "", value: "" });
  };

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="webhook.url"
        rules={{ required: "Webhook URL is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Webhook URL <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="https://example.com/webhook"
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormDescription>
              The HTTP URL to call when the trigger fires. We will send a POST
              request to this URL. Only HTTPS URLs are allowed for security.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="webhook.apiVersion.prompt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Version</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select API version" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="v1">v1</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              The API version to use for the webhook payload format when prompt
              events are triggered.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <FormLabel>Headers</FormLabel>

        {/* Default Headers Section */}
        <div className="mb-4">
          <FormDescription className="mb-2">
            Default headers (automatically added by Langfuse):
          </FormDescription>
          {Object.entries({
            ...WebhookDefaultHeaders,
            "x-langfuse-signature": `t=<timestamp>,v1=<signature>`,
          }).map(([key, value]) => (
            <div key={key} className="mb-2 grid grid-cols-[1fr,1fr,auto] gap-2">
              <FormItem>
                <FormControl>
                  <Input value={key} disabled={true} className="bg-muted/50" />
                </FormControl>
              </FormItem>
              <FormItem>
                <FormControl>
                  <Input
                    value={value}
                    disabled={true}
                    className="bg-muted/50"
                  />
                </FormControl>
              </FormItem>
              <div className="w-10" />{" "}
              {/* Spacer to align with editable headers */}
            </div>
          ))}
        </div>

        {/* Custom Headers Section */}
        <FormDescription className="mb-2">
          Optional custom headers to include in the webhook request:
        </FormDescription>

        {customHeaderFields.map((field) => {
          // Find the original index in the headerFields array
          const originalIndex = headerFields.findIndex(
            (f) => f.id === field.id,
          );
          return (
            <div
              key={field.id}
              className="mb-2 grid grid-cols-[1fr,1fr,auto] gap-2"
            >
              <FormField
                control={form.control}
                name={`webhook.headers.${originalIndex}.name`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Header Name"
                        {...field}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`webhook.headers.${originalIndex}.value`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Value"
                        {...field}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeHeader(originalIndex)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
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
          <Plus className="mr-1 h-4 w-4" />
          Add Custom Header
        </Button>
      </div>

      {/* Webhook Secret Section */}
      <div>
        <FormLabel>Webhook Secret</FormLabel>
        <FormDescription className="mb-2">
          Use this secret to verify webhook signatures for security. The secret
          is automatically included in the x-langfuse-signature header.
        </FormDescription>

        {action?.id ? (
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CodeView
                  className="bg-muted/50"
                  content={action.config.displaySecretKey}
                  defaultCollapsed={false}
                />
              </div>
              <div className="flex gap-2">
                <RegenerateWebhookSecretButton
                  projectId={projectId}
                  action={action}
                />
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Secret is encrypted and can only be viewed when generated or
              regenerated
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
            Webhook secret will be generated when the automation is created.
          </div>
        )}
      </div>
    </div>
  );
};

export const RegenerateWebhookSecretButton = ({
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
      console.error("Failed to regenerate webhook secret:", error);
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
            disabled={regenerateSecretMutation.isLoading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${regenerateSecretMutation.isLoading ? "animate-spin" : ""}`}
            />
            Regenerate
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
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
              disabled={regenerateSecretMutation.isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={regenerateSecretMutation.isLoading}
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
  headers: { name: string; value: string }[],
): Record<string, string> => {
  const headersObject: Record<string, string> = {};
  const defaultHeaderKeys = Object.keys(WebhookDefaultHeaders);

  headers.forEach((header) => {
    if (header.name.trim() && header.value.trim()) {
      // Exclude default headers - they will be added automatically by the API
      if (!defaultHeaderKeys.includes(header.name.trim().toLowerCase())) {
        headersObject[header.name.trim()] = header.value.trim();
      }
    }
  });

  return headersObject;
};
