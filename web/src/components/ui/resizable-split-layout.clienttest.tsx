/**
 * Without a rail, a persisted 0% secondary share is an unrecoverable sliver.
 * The layout must restore the default split instead of handing that share to
 * the panel group.
 */
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

const captured = vi.hoisted(() => ({
  groupDefaultLayout: undefined as Record<string, number> | undefined,
  storedLayout: undefined as Record<string, number> | undefined,
}));

vi.mock("@/src/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    defaultLayout,
  }: {
    children: ReactNode;
    defaultLayout?: Record<string, number>;
  }) => {
    captured.groupDefaultLayout = defaultLayout;
    return <div>{children}</div>;
  },
  ResizableHandle: () => <div />,
  ResizablePanel: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  usePanelRef: () => ({ current: null }),
  useDefaultLayout: () => ({
    defaultLayout: captured.storedLayout,
    onLayoutChanged: vi.fn(),
  }),
}));

import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";

describe("ResizableSplitLayout", () => {
  it("replaces a persisted near-zero secondary share with the default size", () => {
    captured.storedLayout = { primary: 99.6, secondary: 0.4 };

    render(
      <ResizableSplitLayout
        primaryContent={<div>primary</div>}
        secondaryContent={<div>secondary</div>}
        open
        defaultPrimarySize={70}
        defaultSecondarySize={30}
        minSecondarySize="24rem"
        keepSecondaryMounted={false}
      />,
    );

    expect(captured.groupDefaultLayout).toEqual({
      primary: 70,
      secondary: 30,
    });
  });
});
