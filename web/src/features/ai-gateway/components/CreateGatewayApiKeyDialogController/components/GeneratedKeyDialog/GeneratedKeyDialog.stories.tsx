import type { ComponentProps } from "react";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { GeneratedKeyDialog } from "./GeneratedKeyDialog";

const SECRET_KEY = "sk-lf-test-secret";

const meta = preview.meta({
  component: GeneratedKeyDialog,
  parameters: { layout: "fullscreen" },
  args: { children: <Dialog.Body>{SECRET_KEY}</Dialog.Body> },
  render: (args) => <OpenGeneratedKeyDialog {...args} />,
});

function OpenGeneratedKeyDialog(
  props: ComponentProps<typeof GeneratedKeyDialog>,
) {
  return (
    <DialogController<true>
      initialState={() => true}
      renderDialog={() => <GeneratedKeyDialog {...props} />}
    >
      {() => null}
    </DialogController>
  );
}

export const Default = meta.story({});

export const ClosesOnlyOnDone = meta.story({
  name: "(Test) Keeps the one-time key open on Escape and closes only on Done",
  play: async () => {
    expect(await screen.findByText(SECRET_KEY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(screen.getByText(SECRET_KEY)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText(SECRET_KEY)).toBeNull());
  },
});
