import type { ComponentProps } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { EditGatewayApiKeyDialog } from "./EditGatewayApiKeyDialog";

const models = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-4.1",
  "claude-opus-4-1",
  "claude-sonnet-4-5",
].map((model) =>
  model.startsWith("claude")
    ? { slug: `anthropic:${model}`, model, provider: "ANTHROPIC" as const }
    : { slug: `openai:${model}`, model, provider: "OPENAI" as const },
);
const enabledModels = {
  models,
  connections: [
    { name: "openai", isCatalogUnknown: false },
    { name: "anthropic", isCatalogUnknown: false },
  ],
};

const meta = preview.meta({
  component: EditGatewayApiKeyDialog,
  parameters: { layout: "fullscreen" },
  args: {
    defaultValues: {
      metadata: [{ key: "environment", value: "production" }],
      modelPatterns: ["openai:*", "-*mini*"],
    },
    enabledModels,
    errorMessage: null,
    isSubmitting: false,
    onSubmit: fn(),
  },
  render: (args) => <OpenDialog {...args} />,
});

function OpenDialog(props: ComponentProps<typeof EditGatewayApiKeyDialog>) {
  return (
    <DialogController<true>
      initialState={() => true}
      renderDialog={() => <EditGatewayApiKeyDialog {...props} />}
    >
      {() => null}
    </DialogController>
  );
}

export const Default = meta.story({});

export const Unrestricted = meta.story({
  args: { defaultValues: { metadata: [], modelPatterns: [] } },
});

export const WithError = meta.story({
  args: { errorMessage: "Gateway key not found." },
});

export const SavesChanges = meta.story({
  name: "(Test) Saves metadata and models",
  play: async ({ args }) => {
    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    await expect(saveButton).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Clear models" }));
    await userEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    const keys = screen.getAllByRole("textbox", { name: "Metadata key" });
    const values = screen.getAllByRole("textbox", { name: "Metadata value" });
    await userEvent.type(keys[1]!, "team");
    await userEvent.type(values[1]!, "search");
    await userEvent.click(saveButton);
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        metadata: { environment: "production", team: "search" },
        allowedModels: null,
      }),
    );
  },
});
