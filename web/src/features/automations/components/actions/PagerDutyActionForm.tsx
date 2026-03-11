import { Input } from "@/src/components/ui/input";
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
import { type UseFormReturn } from "react-hook-form";
import { type ActionDomain } from "@langfuse/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface PagerDutyActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain;
}

export const PagerDutyActionForm: React.FC<PagerDutyActionFormProps> = ({
  form,
  disabled,
}) => {
  const displayIntegrationKey = form.watch("pagerduty.displayIntegrationKey");

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="pagerduty.integrationKey"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Integration Key
              {!displayIntegrationKey && (
                <span className="ml-1 text-destructive">*</span>
              )}
            </FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder={
                  displayIntegrationKey || "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                }
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              PagerDuty Events API v2 integration key.{" "}
              {displayIntegrationKey
                ? "Leave empty to keep existing key. "
                : ""}
              <Link
                href="https://support.pagerduty.com/docs/services-and-integrations#create-a-generic-events-api-integration"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-primary hover:underline"
              >
                Learn more <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="pagerduty.severity"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Severity</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="pagerduty.source"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Source</FormLabel>
            <FormControl>
              <Input placeholder="Langfuse" disabled={disabled} {...field} />
            </FormControl>
            <FormDescription>
              Optional. The source of the alert (e.g., service name).
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="pagerduty.component"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Component</FormLabel>
            <FormControl>
              <Input
                placeholder="LLM Pipeline"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Optional. The component that triggered the alert.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
