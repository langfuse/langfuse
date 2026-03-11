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

interface JiraActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain;
}

export const JiraActionForm: React.FC<JiraActionFormProps> = ({
  form,
  disabled,
}) => {
  const displayApiToken = form.watch("jira.displayApiToken");

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="jira.jiraBaseUrl"
        rules={{ required: "Jira base URL is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Jira Base URL <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="https://yourcompany.atlassian.net"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Your Jira Cloud instance base URL.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="jira.email"
        rules={{ required: "Email is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Email <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="you@yourcompany.com"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Email address associated with your Jira API token.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="jira.apiToken"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              API Token
              {!displayApiToken && (
                <span className="ml-1 text-destructive">*</span>
              )}
            </FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder={displayApiToken || "Enter Jira API token"}
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              {displayApiToken ? "Leave empty to keep existing token. " : ""}
              <Link
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-primary hover:underline"
              >
                Create API token <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="jira.projectKey"
        rules={{ required: "Project key is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Project Key <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input placeholder="PROJ" disabled={disabled} {...field} />
            </FormControl>
            <FormDescription>
              The key of the Jira project where issues will be created (e.g.,
              PROJ).
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="jira.issueType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Issue Type</FormLabel>
            <FormControl>
              <Input placeholder="Bug" disabled={disabled} {...field} />
            </FormControl>
            <FormDescription>
              Jira issue type (e.g., Bug, Task, Story). Defaults to Bug.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="jira.assigneeAccountId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Assignee Account ID</FormLabel>
            <FormControl>
              <Input
                placeholder="Optional Jira account ID"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Optional. Jira account ID to assign issues to.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
