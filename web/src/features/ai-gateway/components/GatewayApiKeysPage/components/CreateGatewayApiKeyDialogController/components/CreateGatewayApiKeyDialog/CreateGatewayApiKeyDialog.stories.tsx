import type { ComponentProps } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { CreateGatewayApiKeyDialog } from "./CreateGatewayApiKeyDialog";

const enabledModels = [
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

const meta = preview.meta({
  component: CreateGatewayApiKeyDialog,
  parameters: { layout: "fullscreen" },
  args: {
    canIssueServiceAccountKeys: true,
    enabledModels,
    errorMessage: null,
    isSubmitting: false,
    onSubmit: fn(),
  },
  render: (args) => <OpenDialog {...args} />,
});

function OpenDialog(props: ComponentProps<typeof CreateGatewayApiKeyDialog>) {
  return (
    <DialogController<true>
      initialState={() => true}
      renderDialog={() => <CreateGatewayApiKeyDialog {...props} />}
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

    expect(screen.getByText("All enabled models")).toBeVisible();
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
    await userEvent.type(modelsInput, "{Backspace}{Backspace}nothing:*{Enter}");

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
