import { useForm } from "react-hook-form";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Input } from "@/src/components/design-system/Input/Input";
import { Form } from "./Form";

function FormExample({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (values: { name: string }) => void;
}) {
  const form = useForm<{ name: string }>({
    defaultValues: { name: "" },
  });

  return (
    <Form
      onSubmit={form.handleSubmit((values) => onSubmit(values))}
      actions={[
        { id: "save", type: "submit", text: "Save" },
        {
          id: "cancel",
          type: "button",
          text: "Cancel",
          variant: "ghost",
          onClick: onCancel,
        },
      ]}
    >
      <Form.Field control={form.control} name="name" label="Name">
        {(field) => (
          <Input
            id={field.id}
            name={field.name}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
            ref={field.ref}
            aria-describedby={field.inputDescribedById}
            aria-invalid={Boolean(field.error)}
            error={Boolean(field.error)}
          />
        )}
      </Form.Field>
    </Form>
  );
}

const onCancel = fn();
const onSubmit = fn();

const meta = preview.meta({
  component: FormExample,
  args: { onCancel, onSubmit },
});

export const Default = meta.story({});

export const Submits = meta.story({
  name: "(Test) Submits",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    onSubmit.mockClear();

    await userEvent.type(canvas.getByLabelText("Name"), "PostHog");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(onSubmit).toHaveBeenCalledWith({ name: "PostHog" });
  },
});
