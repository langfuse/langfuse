import { type UseFormReturn } from "react-hook-form";

import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { type MonitorAutomationFormValues } from "../fns/monitorAutomationFormSchema";
import { InlineCode } from "./InlineCode";

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
      <Form.Field
        control={form.control}
        name="githubDispatch.url"
        label="Repository dispatch URL"
        description={
          <>
            GitHub API endpoint for repository dispatch.{" "}
            <TextLink
              path={dispatchDocsUrl}
              value="Learn more"
              variant="inline"
              external
            />
          </>
        }
      >
        {(field) => (
          <Input
            id={field.id}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            type="url"
            placeholder="https://api.github.com/repos/owner/repo/dispatches"
            aria-describedby={field.inputDescribedById}
            aria-invalid={!!field.error}
            error={!!field.error}
          />
        )}
      </Form.Field>
      <Form.Field
        control={form.control}
        name="githubDispatch.eventType"
        label="Event type"
        description={
          <>
            Add this to the{" "}
            <InlineCode>on.repository_dispatch.types</InlineCode> filter in your
            workflow.
          </>
        }
      >
        {(field) => (
          <Input
            id={field.id}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            placeholder="e.g. langfuse-alert"
            aria-describedby={field.inputDescribedById}
            aria-invalid={!!field.error}
            error={!!field.error}
          />
        )}
      </Form.Field>
      <Form.Field
        control={form.control}
        name="githubDispatch.githubToken"
        label="GitHub personal access token"
        description={
          <>
            GitHub PAT with <InlineCode>repo</InlineCode> scope for repository
            dispatch.{" "}
            <TextLink
              path={createTokenUrl}
              value="Create token"
              variant="inline"
              external
            />
          </>
        }
      >
        {(field) => (
          <PasswordInput
            id={field.id}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            placeholder="ghp_..."
            aria-describedby={field.inputDescribedById}
            aria-invalid={!!field.error}
            error={!!field.error}
          />
        )}
      </Form.Field>
    </>
  );
}
