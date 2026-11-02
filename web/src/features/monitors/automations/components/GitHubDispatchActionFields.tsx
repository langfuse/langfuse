import { useId } from "react";
import { type UseFormReturn } from "react-hook-form";

import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { type MonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";
import { InlineCode } from "./InlineCode";
import { describedBy } from "../helpers/describedBy";
import { stripUrlScheme } from "../helpers/stripUrlScheme";
import { FieldHelp } from "./FieldHelp";
import { FieldWithHelp } from "./FieldWithHelp";
import { HelpLink } from "./HelpLink";
import { PrefixedInput } from "./PrefixedInput";

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
  const urlHelpId = useId();
  const eventTypeHelpId = useId();
  const tokenHelpId = useId();

  return (
    <>
      <FieldWithHelp>
        <Form.Field
          control={form.control}
          name="githubDispatch.url"
          label="Repository dispatch URL"
        >
          {(field) => (
            <PrefixedInput
              id={field.id}
              name={field.name}
              value={field.value}
              onChange={(event) =>
                field.onChange(stripUrlScheme(event.target.value))
              }
              onBlur={field.onBlur}
              ref={field.ref}
              prefix="https://"
              inputMode="url"
              placeholder="api.github.com/repos/owner/repo/dispatches"
              aria-describedby={describedBy(
                field.inputDescribedById,
                urlHelpId,
              )}
              aria-invalid={!!field.error}
              error={!!field.error}
            />
          )}
        </Form.Field>
        <FieldHelp id={urlHelpId}>
          GitHub API endpoint for repository dispatch.{" "}
          <HelpLink href={dispatchDocsUrl} text="Learn more" />
        </FieldHelp>
      </FieldWithHelp>
      <FieldWithHelp>
        <Form.Field
          control={form.control}
          name="githubDispatch.eventType"
          label="Event type"
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
              aria-describedby={describedBy(
                field.inputDescribedById,
                eventTypeHelpId,
              )}
              aria-invalid={!!field.error}
              error={!!field.error}
            />
          )}
        </Form.Field>
        <FieldHelp id={eventTypeHelpId}>
          Add this to the <InlineCode>on.repository_dispatch.types</InlineCode>{" "}
          filter in your workflow.
        </FieldHelp>
      </FieldWithHelp>
      <FieldWithHelp>
        <Form.Field
          control={form.control}
          name="githubDispatch.githubToken"
          label="GitHub personal access token"
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
              aria-describedby={describedBy(
                field.inputDescribedById,
                tokenHelpId,
              )}
              aria-invalid={!!field.error}
              error={!!field.error}
            />
          )}
        </Form.Field>
        <FieldHelp id={tokenHelpId}>
          GitHub PAT with <InlineCode>repo</InlineCode> scope for repository
          dispatch. <HelpLink href={createTokenUrl} text="Create token" />
        </FieldHelp>
      </FieldWithHelp>
    </>
  );
}
