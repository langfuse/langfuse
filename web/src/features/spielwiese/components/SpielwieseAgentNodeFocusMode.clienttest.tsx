import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function installFocusModeAnimationMocks() {
  const animateMock = jest.fn(function (this: Element) {
    return {
      cancel: jest.fn(),
      finished: Promise.resolve(),
      play: jest.fn(),
    } as unknown as Animation;
  });
  const requestAnimationFrameSpy = jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  const originalAnimate = Element.prototype.animate;

  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: animateMock,
  });

  return {
    animateMock,
    restore: () => {
      Object.defineProperty(Element.prototype, "animate", {
        configurable: true,
        value: originalAnimate,
      });
      requestAnimationFrameSpy.mockRestore();
    },
  };
}

function getFocusModeElements() {
  const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
  const headerActions = within(visionNode).getByTestId(
    "spielwiese-agent-node-header-actions",
  );
  const previewButton = within(headerActions).getByRole("button", {
    name: "Preview vision-agent node",
  });
  const cardDeck = within(visionNode).getByTestId(
    "spielwiese-agent-node-card-deck",
  );

  return {
    cardDeck,
    previewButton,
    visionNode,
  };
}

function expectPreviewHoverDoesNotOpenSpotlight(elements: {
  cardDeck: HTMLElement;
  previewButton: HTMLElement;
}) {
  expect(
    screen.queryByTestId("spielwiese-agent-node-preview-spotlight"),
  ).toBeNull();
  expect(elements.cardDeck.className).not.toContain("scale-105");

  fireEvent.mouseEnter(elements.previewButton);

  expect(
    screen.queryByTestId("spielwiese-agent-node-preview-spotlight"),
  ).toBeNull();
  expect(elements.cardDeck.className).not.toContain("scale-105");
}

function expectFocusDialogChrome(animateMock: jest.Mock) {
  const focusDialog = screen.getByRole("dialog", {
    name: "vision-agent focus mode",
  });
  const modalPreviewButton = within(focusDialog).getByRole("button", {
    name: "Close vision-agent focus mode",
  });

  expect(screen.getByTestId("spielwiese-agent-node-focus-modal")).toBeTruthy();
  expect(
    within(focusDialog).getByLabelText("vision-agent Instructions"),
  ).toBeTruthy();
  expect(modalPreviewButton.getAttribute("aria-pressed")).toBe("true");
  expect(focusDialog.className).toContain("max-h-[calc(100dvh-1.5rem)]");
  expect(focusDialog.className).toContain(
    "w-[min(78.125rem,calc(100vw-1.5rem))]",
  );
  expect(focusDialog.className).toContain("origin-top-left");
  expect(animateMock).toHaveBeenCalled();
  expect(animateMock.mock.contexts).toContain(focusDialog);
  expect(
    animateMock.mock.calls.some(
      ([keyframes]) =>
        Array.isArray(keyframes) &&
        keyframes.some(
          (keyframe) =>
            typeof keyframe === "object" &&
            keyframe !== null &&
            "transformOrigin" in keyframe &&
            keyframe.transformOrigin === "top left",
        ),
    ),
  ).toBe(true);

  return {
    focusDialog,
    modalPreviewButton,
  };
}

describe("SpielwieseAgentNode focus mode", () => {
  it("opens a large modal editor on click without triggering a hover spotlight", () => {
    const { animateMock, restore } = installFocusModeAnimationMocks();

    try {
      renderCanvas();
      const elements = getFocusModeElements();

      expectPreviewHoverDoesNotOpenSpotlight(elements);

      fireEvent.click(elements.previewButton);

      const { modalPreviewButton } = expectFocusDialogChrome(animateMock);

      fireEvent.click(modalPreviewButton);

      expect(
        screen.queryByRole("dialog", {
          name: "vision-agent focus mode",
        }),
      ).toBeNull();
    } finally {
      restore();
    }
  });
});
