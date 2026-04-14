import type { ComponentProps, ReactNode, Ref } from "react";

type MockResizableProps = ComponentProps<"div"> & {
  children?: ReactNode;
};

type MockPanelProps = MockResizableProps & {
  defaultSize?: unknown;
  maxSize?: unknown;
  panelRef?: Ref<{
    collapse: () => void;
    expand: () => void;
    getSize: () => { asPercentage: number; inPixels: number };
    isCollapsed: () => boolean;
    resize: (size: number | string) => void;
  } | null>;
  minSize?: unknown;
  withHandle?: boolean;
};

function renderMockHandleAffordances(
  React: { createElement: (...args: unknown[]) => unknown },
  withHandle?: boolean,
) {
  if (withHandle) {
    return [
      React.createElement("div", {
        className: "bg-border z-10 flex h-8 w-1.5 shrink-0 rounded-full",
        "data-resizable-handle-pill": "",
        key: "pill",
      }),
    ];
  }

  return [
    React.createElement("div", {
      "aria-hidden": "true",
      className: "h-1.5 w-10 rounded-full group-hover/resize-handle:opacity-0",
      "data-testid": "spielwiese-resizable-handle-resting-pill",
      key: "resting",
    }),
    React.createElement("div", {
      "aria-hidden": "true",
      className: "rounded-full z-30",
      "data-resizable-hover-handle": "",
      key: "hover",
    }),
  ];
}

jest.mock("../ui/resizable", () => {
  const React = require("react");
  const sanitizeProps = ({
    defaultSize,
    maxSize,
    minSize,
    panelRef,
    withHandle,
    ...props
  }: MockPanelProps) => props;

  return {
    ResizablePanelGroup: ({ children, ...props }: MockResizableProps) =>
      React.createElement("div", props, children),
    ResizablePanel: ({ children, panelRef, ...props }: MockPanelProps) => {
      const [lastResize, setLastResize] = React.useState<string | null>(null);

      React.useImperativeHandle(
        panelRef,
        () => ({
          collapse: () => {},
          expand: () => {},
          getSize: () => ({
            asPercentage: 32,
            inPixels: 320,
          }),
          isCollapsed: () => false,
          resize: (size: number | string) => {
            setLastResize(String(size));
          },
        }),
        [],
      );

      return React.createElement(
        "div",
        {
          "data-last-resize": lastResize ?? undefined,
          ...sanitizeProps(props),
        },
        children,
      );
    },
    ResizableHandle: ({ children, withHandle, ...props }: MockPanelProps) =>
      React.createElement(
        "div",
        { role: "separator", ...sanitizeProps(props) },
        children,
        ...renderMockHandleAffordances(React, withHandle),
      ),
  };
});
