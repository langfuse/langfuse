import { useEffect, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { expect, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Input } from "@/src/components/design-system/Input/Input";
import { FormField } from "./FormField";
import { Form } from "../Form/Form";

function FormFieldExample({
  description,
  error,
}: {
  description?: ComponentProps<typeof FormField>["description"];
  error?: string;
}) {
  const form = useForm<{ name: string }>({
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (error) {
      form.setError("name", { message: error });
    }
  }, [error, form]);

  return (
    <FormField
      control={form.control}
      name="name"
      label="Name"
      description={description}
    >
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
    </FormField>
  );
}

const meta = preview.meta({
  component: FormFieldExample,
  args: {},
});

export const Default = meta.story({});

export const RichDescription = meta.story({
  name: "(Test) Rich description with error",
  args: {
    description: [
      { type: "text", text: "Use the " },
      { type: "code", text: "name" },
      { type: "text", text: " field. " },
      { type: "link", text: "Learn more", href: "https://langfuse.com/docs" },
      { type: "text", text: " " },
      { type: "strong", text: "Required." },
    ],
    error: "Name is required.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Name");
    const code = canvas.getByText("name", { selector: "code" });
    const description = code.closest("p");
    const error = await canvas.findByText("Name is required.");

    await expect(description).toHaveTextContent(
      "Use the name field. Learn more Required.",
    );
    await expect(input).toHaveAttribute(
      "aria-describedby",
      `${error.id} ${description?.id}`,
    );
  },
});

export const Standalone = meta.story({
  name: "(Test) Standalone with rich description",
  render: () => (
    <Form.Field
      label="Webhook secret"
      description={[
        { type: "text", text: "Use the " },
        { type: "code", text: "x-langfuse-signature" },
        { type: "text", text: " header." },
      ]}
    >
      {(field) => (
        <Input
          id={field.id}
          aria-describedby={field.inputDescribedById}
          readOnly
          value="secret"
        />
      )}
    </Form.Field>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const description = canvas.getByText("x-langfuse-signature").closest("p");
    await expect(canvas.getByLabelText("Webhook secret")).toHaveAttribute(
      "aria-describedby",
      description?.id,
    );
  },
});

export const WithDescription = meta.story({
  name: "(Test) Description",
  args: {
    description: "Enter a descriptive name.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Name");
    const description = canvas.getByText("Enter a descriptive name.");

    await expect(input).toHaveAttribute("aria-describedby", description.id);
  },
});

export const WithError = meta.story({
  name: "(Test) Error",
  args: {
    description: "Enter a descriptive name.",
    error: "Name is required.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Name");
    const error = await canvas.findByText("Name is required.");

    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input.getAttribute("aria-describedby")).toContain(error.id);
  },
});

export const WithLabelInfo = meta.story({
  render: () => {
    const form = useForm<{ name: string }>({ defaultValues: { name: "" } });

    return (
      <CustomTooltip content={<span>Additional context</span>} delay={0}>
        {({ getTriggerProps }) => (
          <FormField
            control={form.control}
            name="name"
            label="Name"
            registerLabelTooltip={getTriggerProps}
          >
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
          </FormField>
        )}
      </CustomTooltip>
    );
  },
});
