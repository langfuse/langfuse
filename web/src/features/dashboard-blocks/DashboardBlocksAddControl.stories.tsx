import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DashboardBlocksAddControl } from "./DashboardBlocksAddControl";

const meta = preview.meta({ component: DashboardBlocksAddControl });

function CreationExample(
  args: ComponentProps<typeof DashboardBlocksAddControl>,
) {
  const [pending, setPending] = useState(args.capabilitiesPending);
  const [opened, setOpened] = useState("Nothing opened");
  return (
    <>
      <DashboardBlocksAddControl
        {...args}
        capabilitiesPending={pending}
        onCreate={(kind) => {
          args.onCreate(kind);
          setOpened(`${kind} editor opened`);
        }}
        onExistingWidget={() => {
          args.onExistingWidget();
          setOpened("Existing widget chooser opened");
        }}
      />
      {pending && (
        <Button text="Resolve capabilities" onClick={() => setPending(false)} />
      )}
      <output>{opened}</output>
    </>
  );
}

export const ResolveBeforeCreation = meta.story({
  name: "(Test) Resolve capabilities before creation",
  args: {
    capabilities: { multiQuery: true, markdown: true },
    capabilitiesPending: true,
    onCreate: fn(),
    onExistingWidget: fn(),
  },
  render: (args) => <CreationExample {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const add = canvas.getByRole("button", { name: "Add widget" });
    await expect(add).toBeDisabled();
    await userEvent.click(add);
    await expect(canvas.getByText("Nothing opened")).toBeVisible();
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Resolve capabilities" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Add widget" })).toBeEnabled(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add widget" }));
    await expect(
      body.getByRole("menuitem", { name: /New multi-query chart/ }),
    ).toBeVisible();
    await userEvent.click(body.getByRole("menuitem", { name: /^Markdown/ }));
    await expect(canvas.getByText("markdown editor opened")).toBeVisible();
    await expect(args.onCreate).toHaveBeenCalledTimes(1);
    await expect(args.onCreate).toHaveBeenCalledWith("markdown");
    await expect(args.onExistingWidget).not.toHaveBeenCalled();
  },
});

export const ClassicCreation = meta.story({
  name: "(Test) Classic creation with both capabilities off",
  args: {
    capabilities: { multiQuery: false, markdown: false },
    capabilitiesPending: false,
    onCreate: fn(),
    onExistingWidget: fn(),
  },
  render: (args) => <CreationExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add widget" }));
    await expect(
      canvas.getByText("Existing widget chooser opened"),
    ).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("menu"),
    ).not.toBeInTheDocument();
  },
});

export const MarkdownOnly = meta.story({
  name: "(Test) Markdown capability is independent",
  args: {
    capabilities: { multiQuery: false, markdown: true },
    capabilitiesPending: false,
    onCreate: fn(),
    onExistingWidget: fn(),
  },
  render: (args) => <CreationExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Add widget" }));
    await expect(
      body.queryByRole("menuitem", { name: /New multi-query chart/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("menuitem", { name: /^Markdown/ }));
    await expect(canvas.getByText("markdown editor opened")).toBeVisible();
  },
});

export const MultiQueryOnly = meta.story({
  name: "(Test) Multi-query capability is independent",
  args: {
    capabilities: { multiQuery: true, markdown: false },
    capabilitiesPending: false,
    onCreate: fn(),
    onExistingWidget: fn(),
  },
  render: (args) => <CreationExample {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Add widget" }));
    await expect(
      body.queryByRole("menuitem", { name: /^Markdown/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("menuitem", { name: /New multi-query chart/ }),
    );
    await expect(canvas.getByText("multiQuery editor opened")).toBeVisible();
  },
});
