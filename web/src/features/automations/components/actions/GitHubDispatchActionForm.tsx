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

interface GitHubDispatchActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain;
}

export const GitHubDispatchActionForm: React.FC<
  GitHubDispatchActionFormProps
> = ({ form, disabled }) => {
  const displayGitHubToken = form.watch("githubDispatch.displayGitHubToken");

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="githubDispatch.url"
        rules={{ required: "Repository Dispatch URL is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Repository Dispatch URL{" "}
              <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="https://api.github.com/repos/owner/repo/dispatches"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              GitHub API endpoint for repository dispatch.{" "}
              <Link
                href="https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event"
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
        name="githubDispatch.eventType"
        rules={{ required: "Event type is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Event Type <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="prompt-update"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Event type for GitHub Actions workflow triggers. This will be used
              in the{" "}
              <code className="text-xs">on.repository_dispatch.types</code>{" "}
              filter in your workflow file.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="githubDispatch.githubToken"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              GitHub Personal Access Token
              {!displayGitHubToken && (
                <span className="ml-1 text-destructive">*</span>
              )}
            </FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder={displayGitHubToken || "ghp_..."}
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              GitHub PAT with <code className="text-xs">repo</code> scope for
              repository dispatch.
              {displayGitHubToken
                ? " Leave empty to keep existing token."
                : ""}{" "}
              <Link
                href="https://github.com/settings/tokens/new?scopes=repo&description=Langfuse%20Automation"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-primary hover:underline"
              >
                Create token <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

// Schema exported for use in automationForm.tsx
export const githubDispatchSchema = {
  url: "",
  eventType: "",
  githubToken: "",
};
