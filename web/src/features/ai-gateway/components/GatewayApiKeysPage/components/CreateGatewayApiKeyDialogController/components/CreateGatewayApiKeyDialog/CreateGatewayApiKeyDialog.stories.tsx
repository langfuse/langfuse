import type { ComponentProps } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { CreateGatewayApiKeyDialog } from "./CreateGatewayApiKeyDialog";

const meta = preview.meta({
  component: CreateGatewayApiKeyDialog,
  parameters: { layout: "fullscreen" },
  args: {
    canIssueServiceAccountKeys: true,
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
    await userEvent.click(
      screen.getByRole("button", { name: "Fewer options" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        name: "laptop",
        metadata: { team: "growth" },
        metadataCount: 1,
        expiresAt: expect.any(Date),
        expiryPreset: "1w",
        issuedAs: "user",
      }),
    );
  },
});
