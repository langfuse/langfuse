import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { PublicShareConfirmationDialog } from "./PublicShareConfirmationDialog";

const meta = preview.meta({
  component: PublicShareConfirmationDialog,
  args: { kind: "trace" as const, onConfirm: fn(), onInvite: fn() },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

export const Trace = meta.story({});

export const WithoutInviteAccess = meta.story({
  name: "(Test) Offers no invite to someone who can't invite",
  args: { kind: "session" as const, onInvite: undefined },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await expect(
      body.getByRole("dialog", { name: "Make this session public?" }),
    ).toBeInTheDocument();
    await expect(
      body.queryByRole("button", { name: "Invite viewers instead" }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Make public" }));
    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
});

export const InvitesInstead = meta.story({
  name: "(Test) Inviting teammates instead doesn't make it public",
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      body.getByRole("button", { name: "Invite viewers instead" }),
    );
    await expect(args.onInvite).toHaveBeenCalledOnce();
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});
