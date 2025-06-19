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
import { AvailableWebhookApiSchema } from "@langfuse/shared";

export const webhookSchema = z.object({
  url: z.string().url("Invalid URL"),
  headers: z.array(
    z.object({
      name: z.string(),
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
        <FormLabel>Headers (Optional)</FormLabel>
        <FormDescription className="mb-2">
          Optional headers to include in the webhook request. You can leave this
          empty if no headers are needed.
        </FormDescription>

        {headerFields.length > 0 ? (
          headerFields.map((field, index) => (
            <div
              key={field.id}
              className="mb-2 grid grid-cols-[1fr,1fr,auto] gap-2"
            >
              <FormField
                control={form.control}
                name={`webhook.headers.${index}.name`}
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
                name={`webhook.headers.${index}.value`}
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
                onClick={() => removeHeader(index)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <div className="mb-2 text-sm text-muted-foreground">
            No headers added yet.
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
          Add Header
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

  headers.forEach((header) => {
    if (header.name.trim() && header.value.trim()) {
      headersObject[header.name.trim()] = header.value.trim();
    }
  });

  return headersObject;
};
