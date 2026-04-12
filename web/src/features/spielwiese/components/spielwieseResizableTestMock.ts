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
    ResizableHandle: ({ children, ...props }: MockPanelProps) =>
      React.createElement(
        "div",
        { role: "separator", ...sanitizeProps(props) },
        children,
      ),
  };
});
