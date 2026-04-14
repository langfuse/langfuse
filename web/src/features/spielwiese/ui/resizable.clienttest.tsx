import { render } from "@testing-library/react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./resizable";

jest.mock("react-resizable-panels", () => {
  const React = require("react");
  const sanitizeProps = ({
    defaultSize,
    minSize,
    collapsedSize,
    withHandle,
    ...props
  }: React.ComponentProps<"div"> & {
    collapsedSize?: unknown;
    defaultSize?: unknown;
    minSize?: unknown;
    withHandle?: boolean;
  }) => props;

  return {
    Group: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    Panel: ({
      children,
      ...props
    }: React.ComponentProps<"div"> & {
      collapsedSize?: unknown;
      defaultSize?: unknown;
      minSize?: unknown;
    }) =>
      React.createElement(
        "div",
        { "data-panel": "", ...sanitizeProps(props) },
        children,
      ),
    Separator: ({
      children,
      ...props
    }: React.ComponentProps<"div"> & {
      withHandle?: boolean;
    }) =>
      React.createElement(
        "div",
        { "data-separator": "", ...sanitizeProps(props) },
        children,
      ),
  };
});

function expectPanelGroupChrome(group: HTMLElement) {
  expect(group.className).toContain("[&>[data-panel]]:min-h-0");
  expect(group.className).toContain("[&>[data-panel]]:overflow-hidden");
  expect(group.className).toContain("[&>[data-separator]]:shrink-0");
}

function expectRestingHandleChrome(restingHandle: HTMLElement | null) {
  expect(restingHandle).toBeTruthy();
  expect(restingHandle?.className).toContain("h-1.5");
  expect(restingHandle?.className).toContain("w-10");
  expect(restingHandle?.className).toContain("rounded-full");
}

function expectHoverHandleChrome(hoverHandle: HTMLElement | null) {
  expect(hoverHandle).toBeTruthy();
  expect(hoverHandle?.className).toContain("rounded-full");
  expect(hoverHandle?.className).toContain("z-30");
  expect(hoverHandle?.className).toContain(
    "group-hover/resize-handle:opacity-100",
  );
}

function expectHandleChrome({
  handle,
  hoverHandle,
  restingHandle,
}: {
  handle: HTMLElement | null;
  hoverHandle: HTMLElement | null;
  restingHandle: HTMLElement | null;
}) {
  expect(handle).toBeTruthy();
  expect(handle?.className).toContain("bg-transparent");
  expect(handle?.className).toContain("group/resize-handle");
  expect(handle?.className).toContain("z-20");
  expect(handle?.className).toContain("h-4");
  expectRestingHandleChrome(restingHandle);
  expectHoverHandleChrome(hoverHandle);
}

describe("spielwiese resizable primitives", () => {
  it("applies viewport-safe constraints to the real panel roots", () => {
    render(
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel defaultSize="68%">
          <div>Top</div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="32%">
          <div>Bottom</div>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const group = document.querySelector(
      '[data-slot="spielwiese-resizable-panel-group"]',
    ) as HTMLElement | null;

    expect(group).toBeTruthy();
    expectPanelGroupChrome(group as HTMLElement);

    const panels = document.querySelectorAll(
      '[data-slot="spielwiese-resizable-panel"]',
    );
    const handle = document.querySelector(
      '[data-slot="spielwiese-resizable-handle"]',
    ) as HTMLElement | null;
    const restingHandle = document.querySelector(
      '[data-testid="spielwiese-resizable-handle-resting-pill"]',
    ) as HTMLElement | null;
    const hoverHandle = document.querySelector(
      "[data-resizable-hover-handle]",
    ) as HTMLElement | null;

    expect(panels).toHaveLength(2);
    expect((panels[0] as HTMLElement).className).toContain("h-full");
    expect((panels[0] as HTMLElement).className).toContain("overflow-hidden");
    expect((panels[0] as HTMLElement).className).toContain("[&>*]:min-h-0");
    expectHandleChrome({ handle, hoverHandle, restingHandle });
  });
});
