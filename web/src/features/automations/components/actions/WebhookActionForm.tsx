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
import { X, Plus } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod/v4";
import {
  AvailableWebhookApiSchema,
  WebhookDefaultHeadersSchema,
} from "@langfuse/shared";

export const webhookSchema = z.object({
  url: z.string().url("Invalid URL"),
  headers: z.array(
    z.object({
      name: z.string().refine(
        (name) => {
          if (!name.trim()) return true; // Allow empty names (will be filtered out)
          const defaultHeaderKeys = Object.keys(WebhookDefaultHeadersSchema.shape);
          return !defaultHeaderKeys.includes(name.trim().toLowerCase());
        },
        {
          message: "This header is automatically added by Langfuse and cannot be customized",
        }
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
}

export const WebhookActionForm: React.FC<WebhookActionFormProps> = ({
  form,
  disabled,
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
  const defaultHeaderKeys = Object.keys(WebhookDefaultHeadersSchema.shape);

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
              The URL to call when the trigger fires. We will send a POST
              request to this URL.
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
          <div className="rounded-md border bg-muted/50 p-2">
            <div className="space-y-1">
              {Object.entries(WebhookDefaultHeadersSchema.shape).map(
                ([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[1fr,1fr] gap-2 text-xs"
                  >
                    <div className="font-medium text-muted-foreground">
                      {key}
                    </div>
                    <div className="text-muted-foreground">{value.value}</div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Custom Headers Section */}
        <FormDescription className="mb-2">
          Optional custom headers to include in the webhook request:
        </FormDescription>

        {customHeaderFields.length > 0 ? (
          customHeaderFields.map((field, index) => {
            // Find the original index in the headerFields array
            const originalIndex = headerFields.findIndex(f => f.id === field.id);
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
                        <Input placeholder="Value" {...field} disabled={disabled} />
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
          })
        ) : (
          <div className="mb-2 text-sm text-muted-foreground">
            No custom headers added yet.
          </div>
        )}

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
    </div>
  );
};

// Function to convert the array of header objects to a Record for API
export const formatWebhookHeaders = (
  headers: { name: string; value: string }[],
): Record<string, string> => {
  const headersObject: Record<string, string> = {};
  const defaultHeaderKeys = Object.keys(WebhookDefaultHeadersSchema.shape);

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
