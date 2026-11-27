import { Form } from "@/src/components/design-system/Form/Form";
import { areDestinationUrlsEquivalent } from "@/src/features/automations/destinationUrl";
import { type UseFormReturn } from "react-hook-form";
import { type GitHubDispatchActionFormData } from "./GitHubDispatchActionHandler";

export function GitHubDispatchActionForm({
  form,
  disabled,
}: {
  form: UseFormReturn<GitHubDispatchActionFormData>;
  disabled: boolean;
}) {
  const displayGitHubToken = form.watch("githubDispatch.displayGitHubToken");
  const currentUrl = form.watch("githubDispatch.url");
  const originalUrl = form.watch("githubDispatch.originalUrl");
  const isUrlChanged =
    originalUrl !== undefined &&
    !areDestinationUrlsEquivalent(currentUrl, originalUrl);

  const tokenHint = (() => {
    if (isUrlChanged) {
      return " Enter a new token when changing the dispatch URL.";
    }
    if (displayGitHubToken) {
      return " Leave empty to keep existing token.";
    }
    return "";
  })();

  return (
    <div className="space-y-4">
      <Form.InputField
        control={form.control}
        name="githubDispatch.url"
        label="Repository dispatch URL"
        required
        placeholder="https://api.github.com/repos/owner/repo/dispatches"
        disabled={disabled}
        description={[
          {
            type: "text",
            text: "GitHub API endpoint for repository dispatch. ",
          },
          {
            type: "link",
            text: "Learn more",
            href: "https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event",
          },
        ]}
      />
      <Form.InputField
        control={form.control}
        name="githubDispatch.eventType"
        label="Event type"
        required
        placeholder="prompt-update"
        disabled={disabled}
        description={[
          {
            type: "text",
            text: "Event type for GitHub Actions workflow triggers. This will be used in the ",
          },
          { type: "code", text: "on.repository_dispatch.types" },
          { type: "text", text: " filter in your workflow file." },
        ]}
      />
      <Form.PasswordInputField
        control={form.control}
        name="githubDispatch.githubToken"
        label="GitHub Personal Access Token"
        required={!displayGitHubToken || isUrlChanged}
        placeholder={displayGitHubToken || "ghp_..."}
        disabled={disabled}
        description={[
          { type: "text", text: "GitHub PAT with " },
          { type: "code", text: "repo" },
          {
            type: "text",
            text: ` scope for repository dispatch.${tokenHint} `,
          },
          {
            type: "link",
            text: "Create token",
            href: "https://github.com/settings/tokens/new?scopes=repo&description=Langfuse%20Automation",
          },
        ]}
      />
    </div>
  );
}
