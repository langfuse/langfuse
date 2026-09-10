import { fireEvent, render, screen } from "@testing-library/react";

import { DialogController, DialogTitle } from "@/src/components/ui/dialog";
import { LAYER_ORDER } from "@/src/components/ui/layer";

const installOverlayLayers = () => {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
};

describe("DialogController", () => {
  beforeEach(() => {
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it.each([null, undefined])(
    "keeps %s as active state until closed",
    (state) => {
      render(
        <DialogController<string | null | undefined>
          closeOnInteractionOutside={false}
          size="default"
          renderContent={({ state: activeState, closeDialog }) => (
            <>
              <DialogTitle>Stateful dialog</DialogTitle>
              <output>{String(activeState)}</output>
              <button type="button" onClick={closeDialog}>
                Close from content
              </button>
            </>
          )}
        >
          {({ isOpen, openDialog }) => (
            <>
              <output>{isOpen ? "open" : "closed"}</output>
              <button type="button" onClick={() => openDialog(state)}>
                Open
              </button>
            </>
          )}
        </DialogController>,
      );

      expect(screen.queryByText("Stateful dialog")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(screen.getByText(String(state))).toBeInTheDocument();
      expect(screen.getByText("open")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Close from content" }),
      );
      expect(screen.queryByText("Stateful dialog")).not.toBeInTheDocument();
      expect(screen.getByText("closed")).toBeInTheDocument();
    },
  );

  it("preserves close veto and dismissal callbacks", () => {
    const onBeforeClose = vi.fn(() => false);
    const onDismiss = vi.fn();

    render(
      <DialogController
        closeOnInteractionOutside
        onBeforeClose={onBeforeClose}
        onDismiss={onDismiss}
        size="default"
        renderContent={() => <DialogTitle>Vetoed dialog</DialogTitle>}
      >
        {({ openDialog }) => (
          <button type="button" onClick={() => openDialog()}>
            Open
          </button>
        )}
      </DialogController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onBeforeClose).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("Vetoed dialog")).toBeInTheDocument();
  });
});
