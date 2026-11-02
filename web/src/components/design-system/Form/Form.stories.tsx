import { useForm, type ResolverResult } from "react-hook-form";
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

const selectSubmit = fn();

const transformedSubmit = fn();

function TransformedInputFieldExample() {
  const form = useForm<{ code: string }>({ defaultValues: { code: "" } });
  return (
    <Form
      onSubmit={form.handleSubmit(transformedSubmit)}
      actions={[{ id: "save", type: "submit", text: "Save" }]}
    >
      <Form.InputField
        control={form.control}
        name="code"
        label="Code"
        transformValue={(value) => value.toUpperCase()}
      />
    </Form>
  );
}

export const TransformedInputField = meta.story({
  name: "(Test) Input value transformation",
  render: () => <TransformedInputFieldExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Code");
    transformedSubmit.mockClear();
    await userEvent.type(input, "abc");
    await expect(input).toHaveValue("ABC");
    await userEvent.clear(input);
    await expect(input).toHaveValue("");
    await userEvent.paste("def");
    await expect(input).toHaveValue("DEF");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(transformedSubmit).toHaveBeenCalledWith(
      { code: "DEF" },
      expect.anything(),
    );
  },
});

const passwordSubmit = fn();

function PasswordInputFieldExample() {
  const form = useForm<{ password: string }>({
    defaultValues: { password: "" },
    mode: "onBlur",
    resolver: (values): ResolverResult<{ password: string }> => {
      if (!values.password) {
        return {
          values: {},
          errors: {
            password: { type: "required", message: "Password is required." },
          },
        };
      }
      return { values, errors: {} };
    },
  });

  return (
    <Form
      onSubmit={form.handleSubmit(passwordSubmit)}
      actions={[{ id: "save", type: "submit", text: "Save" }]}
    >
      <Form.PasswordInputField
        control={form.control}
        name="password"
        label="Password"
        description={[{ type: "text", text: "Enter your password." }]}
        aria-describedby="password-extra-help"
        placeholder="Your password"
      />
      <p id="password-extra-help">Additional help.</p>
    </Form>
  );
}

export const PasswordInputField = meta.story({
  name: "(Test) Password field bindings and validation",
  render: () => <PasswordInputFieldExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Password");
    passwordSubmit.mockClear();

    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveAttribute("placeholder", "Your password");
    await userEvent.click(input);
    await userEvent.tab();
    const error = await canvas.findByText("Password is required.");
    const description = canvas.getByText("Enter your password.");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAttribute(
      "aria-describedby",
      `${error.id} ${description.id} password-extra-help`,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(input).toHaveFocus();
    await userEvent.type(input, "secret-token");
    await userEvent.click(
      canvas.getByRole("button", { name: "Show password" }),
    );
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("secret-token");
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide password" }),
    );
    await expect(input).toHaveAttribute("type", "password");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(passwordSubmit).toHaveBeenCalledWith(
      { password: "secret-token" },
      expect.anything(),
    );
    await expect(input).toHaveAttribute("aria-invalid", "false");
  },
});

function SelectInputFieldExample() {
  const form = useForm<{ region: "US" | "EU" }>({
    defaultValues: { region: "US" },
    mode: "onBlur",
    resolver: (values): ResolverResult<{ region: "US" | "EU" }> =>
      values.region === "US"
        ? {
            values: {},
            errors: { region: { type: "validate", message: "Select Europe." } },
          }
        : { values, errors: {} },
  });

  return (
    <Form
      onSubmit={form.handleSubmit(selectSubmit)}
      actions={[{ id: "save", type: "submit", text: "Save" }]}
    >
      <Form.SelectInputField
        control={form.control}
        name="region"
        label="Region"
        description={[{ type: "text", text: "Choose your region." }]}
        aria-describedby="region-extra-help"
        options={[
          { value: "US", label: "United States" },
          { value: "EU", label: "Europe" },
        ]}
        placeholder="Select a region"
      />
      <p id="region-extra-help">Additional help.</p>
    </Form>
  );
}

export const SelectInputField = meta.story({
  name: "(Test) Select field bindings and validation",
  render: () => <SelectInputFieldExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByLabelText("Region");
    selectSubmit.mockClear();

    await expect(trigger).toHaveTextContent("United States");
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await userEvent.tab();
    const error = await canvas.findByText("Select Europe.");
    const description = canvas.getByText("Choose your region.");
    await expect(trigger).toHaveAttribute("aria-invalid", "true");
    await expect(trigger).toHaveAttribute(
      "aria-describedby",
      `${error.id} ${description.id} region-extra-help`,
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("option", { name: "Europe" }));
    await expect(trigger).toHaveTextContent("Europe");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(selectSubmit).toHaveBeenCalledWith(
      { region: "EU" },
      expect.anything(),
    );
  },
});
