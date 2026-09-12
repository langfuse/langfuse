import { fireEvent, render, screen } from "@testing-library/react";
import {
  Drawer,
  DrawerContent,
  DrawerController,
  DrawerTitle,
} from "@/src/components/ui/drawer";

function mountOverlayRoot() {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of [
    "panel",
    "agent",
    "modal",
    "popover",
    "tooltip",
    "toast",
  ]) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
}

describe("Drawer", () => {
  beforeEach(() => {
    mountOverlayRoot();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("sizes compact bottom drawers to their content instead of a third of the viewport", () => {
    render(
      <Drawer open forceDirection="bottom" shouldScaleBackground={false}>
        <DrawerContent id="compact-drawer">
          <DrawerTitle>Support</DrawerTitle>
          <button type="button">Email a Support Engineer</button>
        </DrawerContent>
      </Drawer>,
    );

    const drawer = document.querySelector("#compact-drawer");
    expect(drawer).not.toBeNull();
    const classes = drawer?.className.split(/\s+/) ?? [];
    expect(classes).not.toContain("h-1/3");
    expect(classes).toContain("h-auto");
    // Vaul paints a 200%-tall ::after below the sheet so a drag doesn't
    // expose a gap. `overflow-y-auto` would turn that into a hollow
    // scroll region under the last action.
    expect(classes).not.toContain("overflow-y-auto");
  });

  it.each([null, undefined])(
    "keeps %s as active state until closed",
    (state) => {
      render(
        <DrawerController<string | null | undefined>
          forceDirection="bottom"
          renderContent={({ state: activeState, closeDrawer }) => (
            <DrawerContent>
              <DrawerTitle>Stateful drawer</DrawerTitle>
              <output>{String(activeState)}</output>
              <button type="button" onClick={closeDrawer}>
                Close
              </button>
            </DrawerContent>
          )}
        >
          {({ isOpen, openDrawer }) => (
            <>
              <output>{isOpen ? "open" : "closed"}</output>
              <button type="button" onClick={() => openDrawer(state)}>
                Open
              </button>
            </>
          )}
        </DrawerController>,
      );

      expect(screen.queryByText("Stateful drawer")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(screen.getByText(String(state))).toBeInTheDocument();
      expect(screen.getByText("open")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.getByRole("dialog")).toHaveAttribute(
        "data-state",
        "closed",
      );
      expect(screen.getByText("closed")).toBeInTheDocument();
    },
  );

  it("replaces active state without closing", () => {
    render(
      <DrawerController<string | null>
        forceDirection="bottom"
        renderContent={({ state, replaceState }) => (
          <DrawerContent>
            <output>{state ?? "empty"}</output>
            <button type="button" onClick={() => replaceState(null)}>
              Clear
            </button>
          </DrawerContent>
        )}
      >
        {({ isOpen, openDrawer }) => (
          <>
            <output>{isOpen ? "open" : "closed"}</output>
            <button type="button" onClick={() => openDrawer("selection")}>
              Open
            </button>
          </>
        )}
      </DrawerController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("opens from initialState without reacting to later changes", () => {
    const renderController = (initialState: string | undefined) => (
      <DrawerController<string>
        initialState={() => initialState}
        forceDirection="bottom"
        renderContent={({ state }) => (
          <DrawerContent>
            <DrawerTitle>{state}</DrawerTitle>
          </DrawerContent>
        )}
      >
        {() => null}
      </DrawerController>
    );
    const { rerender } = render(renderController("first"));

    expect(screen.getByText("first")).toBeInTheDocument();
    rerender(renderController("second"));
    expect(screen.queryByText("second")).not.toBeInTheDocument();
  });

  it("ignores stale state replacements after closing", () => {
    let replaceStateAfterClose: (() => void) | undefined;

    render(
      <DrawerController<string>
        forceDirection="bottom"
        renderContent={({ closeDrawer, replaceState }) => {
          replaceStateAfterClose = () => replaceState("updated");
          return (
            <DrawerContent>
              <button type="button" onClick={closeDrawer}>
                Close
              </button>
            </DrawerContent>
          );
        }}
      >
        {({ isOpen, openDrawer }) => (
          <>
            <output>{isOpen ? "open" : "closed"}</output>
            <button type="button" onClick={() => openDrawer("initial")}>
              Open
            </button>
          </>
        )}
      </DrawerController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    replaceStateAfterClose?.();

    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("allows consumers to veto closing", () => {
    render(
      <DrawerController
        forceDirection="bottom"
        onOpenChange={(open) => (open ? undefined : false)}
        renderContent={() => (
          <DrawerContent>
            <DrawerTitle>Stateful drawer</DrawerTitle>
          </DrawerContent>
        )}
      >
        {({ openDrawer }) => (
          <button type="button" onClick={openDrawer}>
            Open
          </button>
        )}
      </DrawerController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByText("Stateful drawer")).toBeInTheDocument();
  });
});
