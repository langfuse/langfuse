import { expect, spyOn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { InAppAgentInternalSessionMenuView } from "./InAppAgentInternalSessionMenuView";

const meta = preview.meta({
  component: InAppAgentInternalSessionMenuView,
});

export const Default = meta.story({
  args: {
    conversationId: "aconv_example",
    telemetryProject: {
      data: { projectId: "ai-features-project" },
      isError: false,
      isPending: false,
    },
  },
});

export const TelemetryNotRecorded = meta.story({
  args: {
    conversationId: "aconv_example",
    telemetryProject: {
      data: { projectId: null },
      isError: false,
      isPending: false,
    },
  },
});

export const HipaaRegion = meta.story({
  args: {
    conversationId: "aconv_example",
    telemetryProject: null,
  },
});

export const TestCopiesSessionLink = meta.story({
  name: "(Test) Copies session link and confirms on the trigger",
  args: Default.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    const trigger = canvas.getByRole("button", {
      name: "Internal session actions",
    });
    await userEvent.click(trigger);
    await expect(
      await body.findByRole("link", { name: "Open session in Langfuse" }),
    ).toHaveAttribute(
      "href",
      "/project/ai-features-project/sessions/aconv_example",
    );

    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(
        body.getByRole("button", { name: "Copy session link" }),
      );
      await waitFor(async () => {
        await expect(copy).toHaveBeenCalledWith(
          `${window.location.origin}/project/ai-features-project/sessions/aconv_example`,
        );
      });
      await expect(
        await within(trigger).findByLabelText("Copied"),
      ).toBeInTheDocument();
    } finally {
      copy.mockRestore();
    }
  },
});

export const TestOffersOnlySessionIdInHipaa = meta.story({
  name: "(Test) Offers only the session ID in HIPAA",
  args: HipaaRegion.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Internal session actions" }),
    );
    const menu = await body.findByRole("menu", {
      name: "Internal session actions",
    });
    await expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Copy session ID"]);
  },
});
