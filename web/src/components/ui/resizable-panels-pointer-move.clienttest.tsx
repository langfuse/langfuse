import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Group, Panel, Separator } from "react-resizable-panels";
import { render } from "@testing-library/react";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class PointerEventStub extends MouseEvent {
  pointerId = 1;
  pointerType = "mouse";

  constructor(
    type: string,
    init: MouseEventInit & { pointerId?: number; pointerType?: string } = {},
  ) {
    super(type, init);
    if (init.pointerId !== undefined) this.pointerId = init.pointerId;
    if (init.pointerType !== undefined) this.pointerType = init.pointerType;
  }
}

beforeEach(() => {
  // jsdom has no ResizeObserver or PointerEvent. The library constructs a
  // ResizeObserver while registering a group; without it, mount aborts
  // before the document pointer listener exists.
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("PointerEvent", PointerEventStub);
});

function Split() {
  return (
    <Group orientation="horizontal">
      <Panel defaultSize="50%" id="left">
        left
      </Panel>
      <Separator id="split" />
      <Panel defaultSize="50%" id="right">
        right
      </Panel>
    </Group>
  );
}

function dispatchPointerMove(target: EventTarget) {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.error);
    // jsdom reports a listener exception as an uncaught error unless the
    // error event is cancelled. Cancelling it lets the assertion below own
    // the failure.
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  try {
    target.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
      }),
    );
  } finally {
    window.removeEventListener("error", onError);
  }
  expect(errors).toEqual([]);
}

describe("react-resizable-panels pointermove hit testing", () => {
  it("does not throw when a mounted group element is detached", () => {
    const view = render(<Split />);
    const group = view.container.querySelector("[data-group]");
    expect(group).toBeInstanceOf(HTMLElement);
    const parent = group!.parentElement;
    group!.remove();
    expect(group!.isConnected).toBe(false);

    try {
      dispatchPointerMove(document.body);
    } finally {
      parent?.appendChild(group!);
      view.unmount();
    }
  });

  it("does not throw when the pointer target is removed during dispatch", () => {
    const view = render(<Split />);
    const target = document.createElement("div");
    document.body.appendChild(target);
    const removeTarget = (event: Event) => {
      if (event.target === target) target.remove();
    };
    document.addEventListener("pointermove", removeTarget, true);

    try {
      dispatchPointerMove(target);
      expect(target.isConnected).toBe(false);
    } finally {
      document.removeEventListener("pointermove", removeTarget, true);
      target.remove();
      view.unmount();
    }
  });

  it("does not throw when a group is mounted in another document", () => {
    const view = render(<Split />);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDocument = iframe.contentDocument;
    const iframeWindow = iframe.contentWindow;
    expect(iframeDocument?.body).toBeTruthy();
    expect(iframeWindow).toBeTruthy();
    Object.defineProperty(iframeWindow, "ResizeObserver", {
      configurable: true,
      value: window.ResizeObserver,
    });

    const mountPoint = iframeDocument!.createElement("div");
    iframeDocument!.body.appendChild(mountPoint);
    const root = createRoot(mountPoint);
    act(() => {
      root.render((<Split />) as ReactNode);
    });

    try {
      expect(mountPoint.querySelector("[data-group]")?.ownerDocument).toBe(
        iframeDocument,
      );
      const separator = view.container.querySelector("[data-separator]");
      act(() => {
        dispatchPointerMove(document.body);
      });
      // The parent split is still a hit. Only the other document's group is
      // skipped, so this separator enters the hover state.
      expect(separator).toHaveAttribute("data-separator", "hover");
    } finally {
      act(() => {
        root.unmount();
      });
      iframe.remove();
      view.unmount();
    }
  });
});
