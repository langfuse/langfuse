import type { ComponentProps } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GatewayApiKeyDialog } from "./GatewayApiKeyDialog";

const models = [
  ...[
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o3-mini",
    "o4-mini",
    "o3-deep-research-preview",
  ].map((model) => ({
    slug: `openai:${model}`,
    model,
    provider: "OPENAI" as const,
  })),
  ...["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"].map(
    (model) => ({
      slug: `anthropic:${model}`,
      model,
      provider: "ANTHROPIC" as const,
    }),
  ),
];
const enabledModels = {
  models,
  connections: [
    { name: "openai", isCatalogUnknown: false },
    { name: "anthropic", isCatalogUnknown: false },
  ],
};

const meta = preview.meta({
  component: GatewayApiKeyDialog,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Create gateway key",
    submitLabel: "Create key",
    canIssueServiceAccountKeys: true,
    enabledModels,
    errorMessage: null,
    isSubmitting: false,
    onSubmit: fn(),
  },
  render: (args) => <OpenDialog {...args} />,
});

function OpenDialog(props: ComponentProps<typeof GatewayApiKeyDialog>) {
  return (
    <DialogController<true>
      initialState={() => true}
      renderDialog={() => <GatewayApiKeyDialog {...props} />}
    >
      {() => null}
    </DialogController>
  );
}

export const Default = meta.story({});

export const UserOnly = meta.story({
  args: { canIssueServiceAccountKeys: false },
});

export const WithoutModelsPreview = meta.story({
  args: { enabledModels: undefined },
});

export const WithError = meta.story({
  args: { errorMessage: "Gateway key name already exists." },
});

const editArgs = {
  title: "Edit gateway key",
  submitLabel: "Save changes",
  disabledFields: ["issuedAs" as const, "expiration" as const],
  defaultValues: {
    issuedAs: "serviceAccount" as const,
    name: "backend-service",
    expiryPreset: "custom" as const,
    customExpiry: "2020-01-01",
    metadata: [{ key: "environment", value: "production" }],
    modelPatterns: ["openai:*", "-*mini*"],
  },
};

export const Edit = meta.story({ args: editArgs });

export const SavesEditableFields = meta.story({
  name: "(Test) Edit saves only editable fields",
  args: editArgs,
  play: async ({ args }) => {
    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    await expect(saveButton).toBeDisabled();
    await expect(
      screen.getByRole("tab", { name: "Service account" }),
    ).toBeDisabled();
    await expect(screen.getByRole("radio", { name: "Custom" })).toBeDisabled();
    await expect(
      screen.getByLabelText("Custom expiration date"),
    ).toBeDisabled();

    const name = screen.getByRole("textbox", { name: /name/i });
    await userEvent.clear(name);
    await userEvent.type(name, " search-backend ");
    await userEvent.click(screen.getByRole("button", { name: "Clear models" }));
    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "search-backend",
          metadata: { environment: "production" },
          allowedModels: null,
        }),
      ),
    );
  },
});

export const MoreOptionsExpanded = meta.story({
  name: "(Test) More options expanded",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "More options" }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "Custom" }));
    await userEvent.click(screen.getByRole("button", { name: "Add metadata" }));

    expect(
      screen.getByRole("radio", { name: "Custom", checked: true }),
    ).toBeVisible();
    expect(screen.getByLabelText("Custom expiration date")).toBeVisible();

    await userEvent.type(
      screen.getByLabelText("Custom expiration date"),
      "2020-01-01",
    );

    expect(await screen.findByText("Choose a future date.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Metadata key" })).toBeVisible();
  },
});

export const SubmitsResolvedOptions = meta.story({
  name: "(Test) Submits resolved options",
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /name/i }),
      " laptop ",
    );
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("radio", { name: "1 week" }));
    await userEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Metadata key" }),
      " team ",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Metadata value" }),
      "growth",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Models" }),
      "openai:*, -*mini*, gpt",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Fewer options" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        name: "laptop",
        metadata: { team: "growth" },
        metadataCount: 1,
        allowedModels: ["openai:*", "-*mini*", "*gpt*"],
        expiresAt: expect.any(Date),
        expiryPreset: "1w",
        issuedAs: "user",
      }),
    );
  },
});

export const AllowedModelsPreview = meta.story({
  name: "(Test) Allowed models follow the model patterns",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "More options" }),
    );
    const modelsInput = screen.getByRole("combobox", { name: "Models" });

    await waitFor(() =>
      expect(screen.getByText("All enabled models")).toBeVisible(),
    );
    expect(
      screen.getByText(
        "Allowed models: all enabled models, including ones added later",
      ),
    ).toBeVisible();

    await userEvent.type(modelsInput, "openai:*{Enter}-*preview*{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "View 3 more" }));

    expect(screen.getByText("o4-mini")).toBeVisible();
    expect(screen.queryByText("o3-deep-research-preview")).toBeNull();
    expect(screen.queryByText("claude-sonnet-4-5")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "View less" }));
    await userEvent.type(
      modelsInput,
      "{Backspace}{Backspace}{Backspace}nothing:*{Enter}",
    );

    expect(
      screen.getByText("No enabled models match these patterns."),
    ).toBeVisible();
  },
});

export const SuggestsModelPatterns = meta.story({
  name: "(Test) Suggests connections, models and the typed pattern",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "More options" }),
    );
    const modelsInput = screen.getByRole("combobox", { name: "Models" });
    await userEvent.click(modelsInput);

    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "All enabled models" }),
      ).toBeVisible(),
    );
    expect(screen.getByRole("option", { name: "anthropic:*" })).toBeVisible();

    await userEvent.type(modelsInput, "gpt-5");

    expect(
      screen.getByRole("option", { name: "openai:gpt-5-mini" }),
    ).toBeVisible();
    expect(screen.getByRole("option", { name: "*gpt-5*" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "anthropic:*" })).toBeNull();

    await userEvent.click(
      screen.getByRole("option", { name: "openai:gpt-5-mini" }),
    );

    expect(
      screen.getByRole("button", { name: /remove openai:gpt-5-mini/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Remove All enabled models" }),
    ).toBeNull();
    expect(modelsInput).toHaveValue("");
  },
});

export const EditsModelPatterns = meta.story({
  name: "(Test) Model pattern chips can be edited with the keyboard",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "More options" }),
    );
    const modelsInput = screen.getByRole("combobox", { name: "Models" });

    await userEvent.type(modelsInput, "openai:*{Enter}-*mini*{Enter}");
    await userEvent.type(modelsInput, "{ArrowLeft}{ArrowLeft}{Enter}");

    expect(modelsInput).toHaveValue("openai:*");
    expect(screen.queryByRole("button", { name: "Edit openai:*" })).toBeNull();

    await userEvent.type(modelsInput, "{Backspace}gpt-4o,");

    expect(
      screen.getByRole("button", { name: "Edit openai:gpt-4o" }),
    ).toBeVisible();

    await userEvent.type(modelsInput, "{ArrowLeft}{Delete}");

    expect(
      screen.queryByRole("button", { name: "Edit openai:gpt-4o" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Edit -*mini*" })).toBeVisible();
  },
});
