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
      data: { projectId: "ai-features-project", unavailableReason: null },
      isError: false,
      isPending: false,
    },
  },
});

export const NoTelemetryProjectAccess = meta.story({
  args: {
    conversationId: "aconv_example",
    telemetryProject: {
      data: {
        projectId: "ai-features-project",
        unavailableReason: "no_access",
      },
      isError: false,
      isPending: false,
    },
  },
});

export const TelemetryDisabled = meta.story({
  args: {
    conversationId: "aconv_example",
    telemetryProject: {
      data: { projectId: null, unavailableReason: "telemetry_disabled" },
      isError: false,
      isPending: false,
    },
  },
});

export const TestCopiesLinkWithoutTelemetryProjectAccess = meta.story({
  name: "(Test) Copies link without telemetry project access",
  args: NoTelemetryProjectAccess.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Internal session actions" }),
    );
    const openSession = await body.findByRole("menuitem", {
      name: "Open session in Langfuse",
    });
    await expect(openSession).toHaveAttribute("aria-disabled", "true");
    await expect(
      within(openSession).getByText("Open session in Langfuse"),
    ).toHaveAttribute(
      "title",
      "You need access to the AI telemetry project to open sessions.",
    );
    await expect(body.queryByRole("link")).not.toBeInTheDocument();

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
    } finally {
      copy.mockRestore();
    }
  },
});
