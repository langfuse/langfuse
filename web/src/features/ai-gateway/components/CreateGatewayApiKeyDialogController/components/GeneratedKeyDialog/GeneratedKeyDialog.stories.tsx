import { OpenOverlay } from "@/src/components/design-system/OpenOverlay/OpenOverlay";
import type { ComponentProps } from "react";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
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
    <OpenOverlay>
      <GeneratedKeyDialog {...props} />
    </OpenOverlay>
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
