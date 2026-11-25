import { TriggerEventSource } from "@langfuse/shared";
import { useForm } from "react-hook-form";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { Form } from "@/src/components/design-system/Form/Form";
import { AutomationForm } from "./AutomationForm";
import type { FormValues } from "../ConnectedAutomationForm";

function AutomationFormFixture({
  onSubmit,
}: {
  onSubmit: (values: FormValues) => void;
}) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "Alert updates",
      status: "ACTIVE",
      eventSource: TriggerEventSource.Monitor,
      eventAction: [],
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
      trigger={{
        sourcePicker: null,
        details: { kind: "monitor", projectId: "demo" },
      }}
      renderActionFields={({ disabled }) => (
        <Form.InputField
          control={form.control}
          name="webhook.url"
          label="Webhook URL"
          disabled={disabled}
          required
        />
      )}
      deleteAction={null}
      submitButtonText="Save automation"
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
  name: "(Test) Submit automation",
  args: { onSubmit: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Automation name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Publish alert updates");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save automation" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Publish alert updates",
        actionType: "WEBHOOK",
        webhook: { url: "https://example.com/webhook", headers: [] },
      }),
    );
  },
});
