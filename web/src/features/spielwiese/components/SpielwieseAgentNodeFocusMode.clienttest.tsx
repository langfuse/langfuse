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

describe("SpielwieseAgentNode focus mode", () => {
  it("keeps the node preview button disabled and does not open focus mode", () => {
    const { animateMock, restore } = installFocusModeAnimationMocks();

    try {
      renderCanvas();
      const elements = getFocusModeElements();

      expectPreviewHoverDoesNotOpenSpotlight(elements);
      expect(elements.previewButton.getAttribute("disabled")).toBe("");

      fireEvent.click(elements.previewButton);
      expect(
        screen.queryByRole("dialog", {
          name: "vision-agent focus mode",
        }),
      ).toBeNull();
      expect(animateMock).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
