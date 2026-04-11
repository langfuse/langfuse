import type { ComponentProps, ReactNode } from "react";

type MockResizableProps = ComponentProps<"div"> & {
  children?: ReactNode;
};

type MockPanelProps = MockResizableProps & {
  defaultSize?: unknown;
  minSize?: unknown;
  withHandle?: boolean;
};

jest.mock("../ui/resizable", () => {
  const React = require("react");
  const sanitizeProps = ({
    defaultSize,
    minSize,
    withHandle,
    ...props
  }: MockPanelProps) => props;

  return {
    ResizablePanelGroup: ({ children, ...props }: MockResizableProps) =>
      React.createElement("div", props, children),
    ResizablePanel: ({ children, ...props }: MockPanelProps) =>
      React.createElement("div", sanitizeProps(props), children),
    ResizableHandle: ({ children, ...props }: MockPanelProps) =>
      React.createElement(
        "div",
        { role: "separator", ...sanitizeProps(props) },
        children,
      ),
  };
});
