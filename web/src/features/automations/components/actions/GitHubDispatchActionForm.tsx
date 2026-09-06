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
import { areGitHubDispatchUrlsEquivalent } from "../../githubDispatchUrl";
import { useTranslations } from "next-intl";

interface GitHubDispatchActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain;
}

export const GitHubDispatchActionForm: React.FC<
  GitHubDispatchActionFormProps
> = ({ form, disabled }) => {
  const t = useTranslations("remainderUi.automations.github");
  const displayGitHubToken = form.watch("githubDispatch.displayGitHubToken");
  const currentUrl = form.watch("githubDispatch.url");
  const originalUrl = form.watch("githubDispatch.originalUrl");
  const isUrlChanged =
    originalUrl !== undefined &&
    !areGitHubDispatchUrlsEquivalent(currentUrl, originalUrl);

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="githubDispatch.url"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              {t("url")} <span className="text-destructive ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="https://api.github.com/repos/owner/repo/dispatches"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              {t("urlDescription")}{" "}
              <Link
                href="https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center hover:underline"
              >
                {t("learnMore")} <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="githubDispatch.eventType"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              {t("eventType")} <span className="text-destructive ml-1">*</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="prompt-update"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormDescription>
              {t("eventTypeDescriptionPrefix")}{" "}
              <code className="text-xs">on.repository_dispatch.types</code>{" "}
              {t("eventTypeDescriptionSuffix")}
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
              {t("token")}
              {(!displayGitHubToken || isUrlChanged) && (
                <span className="text-destructive ml-1">*</span>
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
              {t("tokenDescriptionPrefix")}{" "}
              <code className="text-xs">repo</code>{" "}
              {t("tokenDescriptionSuffix")}
              {isUrlChanged
                ? ` ${t("newTokenForChangedUrl")}`
                : displayGitHubToken
                  ? ` ${t("keepExistingToken")}`
                  : ""}{" "}
              <Link
                href="https://github.com/settings/tokens/new?scopes=repo&description=Langfuse%20Automation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center hover:underline"
              >
                {t("createToken")} <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
