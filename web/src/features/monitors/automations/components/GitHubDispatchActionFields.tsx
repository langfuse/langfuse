import { type UseFormReturn } from "react-hook-form";

import { Form } from "@/src/components/design-system/Form/Form";
import { type MonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";
import { stripUrlScheme } from "../helpers/stripUrlScheme";

const dispatchDocsUrl =
  "https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event";
const createTokenUrl =
  "https://github.com/settings/tokens/new?scopes=repo&description=Langfuse%20Automation";

/** GitHubDispatchActionFields collects the repository dispatch endpoint, event type, and token. */
export function GitHubDispatchActionFields({
  form,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
}) {
  return (
    <>
      <Form.InputField
        control={form.control}
        name="githubDispatch.url"
        label="Repository dispatch URL"
        transformValue={stripUrlScheme}
        valuePrefix="https://"
        inputMode="url"
        placeholder="api.github.com/repos/owner/repo/dispatches"
        description={[
          {
            type: "text",
            text: "GitHub API endpoint for repository dispatch. ",
          },
          { type: "link", text: "Learn more", href: dispatchDocsUrl },
        ]}
      />
      <Form.InputField
        control={form.control}
        name="githubDispatch.eventType"
        label="Event type"
        placeholder="e.g. langfuse-alert"
        description={[
          { type: "text", text: "Add this to the " },
          { type: "code", text: "on.repository_dispatch.types" },
          { type: "text", text: " filter in your workflow." },
        ]}
      />
      <Form.PasswordInputField
        control={form.control}
        name="githubDispatch.githubToken"
        label="GitHub personal access token"
        placeholder="ghp_..."
        description={[
          { type: "text", text: "GitHub PAT with " },
          { type: "code", text: "repo" },
          { type: "text", text: " scope for repository dispatch. " },
          { type: "link", text: "Create token", href: createTokenUrl },
        ]}
      />
    </>
  );
}
