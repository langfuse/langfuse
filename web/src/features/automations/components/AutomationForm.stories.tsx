import { TriggerEventSource } from "@langfuse/shared";
import { useForm } from "react-hook-form";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Form } from "@/src/components/design-system/Form/Form";
import { AutomationForm } from "./AutomationForm";
import type { FormValues } from "./ConnectedAutomationForm";

function AutomationFormFixture({
  onSubmit,
}: {
  onSubmit: (values: FormValues) => void;
}) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "Prompt updates",
      status: "ACTIVE",
      eventSource: TriggerEventSource.Prompt,
      eventAction: ["updated"],
      actionType: "WEBHOOK",
      webhook: { url: "https://example.com/webhook", headers: [] },
    },
  });

  return (
    <AutomationForm
      control={form.control}
      isEditing
      showNameAndStatus
      autoFocusName={false}
      fieldsDisabled={false}
      availableActionTypes={["WEBHOOK"]}
      triggerSection={<p>When a prompt version is updated</p>}
      actionFields={
        <Form.InputField
          control={form.control}
          name="webhook.url"
          label="Webhook URL"
          required
        />
      }
      deleteAction={null}
      submitButtonText="Save Automation"
      submitDisabled={false}
      onActionTypeChange={(value) => form.setValue("actionType", value)}
      onCancel={() => form.reset()}
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
    />
  );
}

const meta = preview.meta({ component: AutomationFormFixture });

export default meta;

export const Default = meta.story({
  args: { onSubmit: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Automation Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Publish prompt updates");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save Automation" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Publish prompt updates",
        actionType: "WEBHOOK",
        webhook: { url: "https://example.com/webhook", headers: [] },
      }),
    );
  },
});
