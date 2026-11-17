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

export const WithAllSections = meta.story({
  args: {
    defaultValues: {
      issuedAs: "user",
      name: "laptop",
      expiryPreset: "custom",
      customExpiry: "2099-01-01",
      metadata: [{ key: "team", value: "growth" }],
      modelPatterns: ["openai:*"],
      spendBudget: { interval: "MONTHLY", limitUsd: "250" },
      sections: ["expiration", "spendBudget", "models", "metadata"],
    },
  },
});

export const SpendBudgetUnavailable = meta.story({
  args: {
    spendBudgetUnavailableReason:
      "Spend budgets need recorded gateway requests. Switch the gateway ingestion to usage to set one.",
  },
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
    spendBudget: { interval: "MONTHLY" as const, limitUsd: "250" },
    sections: [
      "expiration" as const,
      "spendBudget" as const,
      "models" as const,
      "metadata" as const,
    ],
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
    expect(
      screen.queryByRole("button", { name: "Remove expiration" }),
    ).toBeNull();

    const name = screen.getByRole("textbox", { name: /name/i });
    await userEvent.clear(name);
    await userEvent.type(name, " search-backend ");
    await userEvent.click(screen.getByRole("button", { name: "Clear models" }));
    await userEvent.click(screen.getByRole("radio", { name: "Weekly" }));
    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "search-backend",
          metadata: { environment: "production" },
          allowedModels: null,
          spendLimit: { interval: "WEEKLY", limitUsd: 250 },
        }),
      ),
    );
  },
});

const sectionRemoveButtonNames =
  /^Remove (expiration|spend budget|model restriction|metadata field)$/;

export const AddedSectionsGoToTheBottom = meta.story({
  name: "(Test) Added sections go below the others",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Additional metadata" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Spend budget" }));
    await userEvent.click(screen.getByRole("button", { name: "Expiration" }));

    const shownSections = () =>
      screen
        .getAllByRole("button", { name: sectionRemoveButtonNames })
        .map((button) => button.getAttribute("aria-label"));
    expect(shownSections()).toEqual([
      "Remove metadata field",
      "Remove spend budget",
      "Remove expiration",
    ]);
    expect(screen.queryByRole("button", { name: "Spend budget" })).toBeNull();

    // Removing the last metadata row removes the metadata section.
    await userEvent.click(
      screen.getByRole("button", { name: "Remove metadata field" }),
    );
    expect(shownSections()).toEqual([
      "Remove spend budget",
      "Remove expiration",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Additional metadata" }),
    );

    expect(shownSections()).toEqual([
      "Remove spend budget",
      "Remove expiration",
      "Remove metadata field",
    ]);
  },
});

export const CustomExpirationMustBeInTheFuture = meta.story({
  name: "(Test) Custom expiration must lie in the future",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Expiration" }),
    );
    expect(screen.queryByRole("radio", { name: "Never" })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Custom" }));
    await userEvent.type(
      screen.getByLabelText("Custom expiration date"),
      "2020-01-01",
    );

    expect(await screen.findByText("Choose a future date.")).toBeVisible();
    await expect(
      screen.getByRole("button", { name: "Create key" }),
    ).toBeDisabled();
  },
});

export const SubmitsResolvedOptions = meta.story({
  name: "(Test) Submits resolved options",
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /name/i }),
      " laptop ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Expiration" }));
    await userEvent.click(screen.getByRole("radio", { name: "1 week" }));
    await userEvent.click(screen.getByRole("button", { name: "Spend budget" }));
    const amount = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.type(amount, "0");
    expect(
      await screen.findByText("Enter an amount greater than $0."),
    ).toBeVisible();
    await userEvent.clear(amount);
    await userEvent.type(amount, "25.5");
    await userEvent.click(screen.getByRole("radio", { name: "Never" }));
    expect(
      screen.getByText(
        "Requests with this key are rejected once the limit is reached.",
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Additional metadata" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Metadata key" }),
      " team ",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Metadata value" }),
      "growth",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Restrict models" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Models" }),
      "openai:*, -*mini*, gpt",
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
        spendLimit: { interval: "TOTAL", limitUsd: 25.5 },
      }),
    );
  },
});

export const RemovedSectionsDropTheirValues = meta.story({
  name: "(Test) Removed sections drop their values",
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /name/i }),
      "laptop",
    );
    await userEvent.click(screen.getByRole("button", { name: "Expiration" }));
    await userEvent.click(screen.getByRole("button", { name: "Spend budget" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove expiration" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove spend budget" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: null,
          expiryPreset: "never",
          spendLimit: null,
        }),
      ),
    );
  },
});

export const AllowedModelsPreview = meta.story({
  name: "(Test) Allowed models follow the model patterns",
  play: async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Restrict models" }),
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
      await screen.findByRole("button", { name: "Restrict models" }),
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
      await screen.findByRole("button", { name: "Restrict models" }),
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
