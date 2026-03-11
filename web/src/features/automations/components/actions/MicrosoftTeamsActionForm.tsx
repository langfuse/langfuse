import { Input } from "@/src/components/ui/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { type UseFormReturn } from "react-hook-form";
import { type ActionDomain } from "@langfuse/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

interface MicrosoftTeamsActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain;
}

export const MicrosoftTeamsActionForm: React.FC<
  MicrosoftTeamsActionFormProps
> = ({ form, disabled }) => {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="microsoftTeams.webhookUrl"
        rules={{ required: "Webhook URL is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Incoming Webhook URL{" "}
              <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="https://outlook.office.com/webhook/..."
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Microsoft Teams Incoming Webhook URL.{" "}
              <Link
                href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
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
    </div>
  );
};
