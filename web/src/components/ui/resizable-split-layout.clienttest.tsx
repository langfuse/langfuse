import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type * as ResizableComponents from "@/src/components/ui/resizable";

const captured = vi.hoisted(() => ({
  groupDefaultLayout: undefined as Record<string, number> | undefined,
  storedLayout: undefined as Record<string, number> | undefined,
}));

vi.mock("@/src/components/ui/resizable", async (importOriginal) => {
  const actual = await importOriginal<typeof ResizableComponents>();
  return {
    ...actual,
    ResizablePanelGroup: (
      props: ComponentProps<typeof actual.ResizablePanelGroup>,
    ) => {
      captured.groupDefaultLayout = props.defaultLayout;
      return <actual.ResizablePanelGroup {...props} />;
    },
    useDefaultLayout: () => ({
      defaultLayout: captured.storedLayout,
      onLayoutChanged: vi.fn(),
    }),
  };
});

import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";

describe("ResizableSplitLayout", () => {
  beforeEach(() => {
    captured.storedLayout = undefined;
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(500);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("reclaims a kept-mounted panel's space on close and restores it on reopen", () => {
    const content = {
      primaryContent: <div>primary</div>,
      secondaryContent: (
        <input aria-label="overview draft" defaultValue="draft" />
      ),
    };
    const { rerender } = render(<ResizableSplitLayout {...content} open />);
    const input = screen.getByRole("textbox", { name: "overview draft" });
    const panel = input.closest<HTMLElement>("[data-panel]");

    expect(Number(panel?.style.flexGrow)).toBeGreaterThan(0);

    rerender(<ResizableSplitLayout {...content} open={false} />);

    expect(panel?.style.flexGrow).toBe("0");
    expect(input).toBeInTheDocument();

    rerender(<ResizableSplitLayout {...content} open />);

    expect(Number(panel?.style.flexGrow)).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "overview draft" })).toBe(input);
  });
});
