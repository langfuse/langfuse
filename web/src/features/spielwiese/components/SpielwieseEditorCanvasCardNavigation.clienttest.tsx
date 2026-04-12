import { fireEvent, render, screen, within } from "@testing-library/react";
import "./spielwieseResizableTestMock";
import { SpielwieseEditorCanvas } from "./SpielwieseEditorCanvas";
import { spielwieseEditorCanvasTestCanvas } from "./spielwieseEditorCanvasTestData";

function renderCanvas() {
  return render(
    <SpielwieseEditorCanvas canvas={spielwieseEditorCanvasTestCanvas} />,
  );
}

function expectCardNavigationButtonChrome(button: HTMLElement) {
  expect(button.className).toContain("border-transparent");
  expect(button.className).toContain("h-6");
  expect(button.className).toContain("w-6");
  expect(button.className).toContain("rounded-[8px]");
  expect(button.className).toContain("hover:bg-background/88");
  expect(button.className).toContain("hover:border-[rgba(0,0,0,0.08)]");
  expect(button.className).toContain(
    "hover:shadow-[inset_0_1px_0_hsl(var(--background)/0.96)]",
  );
  expect(button.className).toContain("shadow-none");
  expect(button.className).not.toContain("h-8");
  expect(button.className).not.toContain("w-8");
}

function getCardNavigationElements(nodeElement: HTMLElement, nodeId: string) {
  const addCardButton = within(nodeElement).getByRole("button", {
    name: `Add a new card after ${nodeId}`,
  });
  const addCardButtonTrigger = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card-add-button-trigger",
  );
  const previousCardButton = within(nodeElement).getByRole("button", {
    name: `Show previous card for ${nodeId}`,
  });
  const previousCardButtonTrigger = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card-back-button-trigger",
  );
  const cardViewport = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card-viewport",
  );
  const cardSwitcher = cardViewport.parentElement as HTMLElement;
  const addCardButtonShell = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card-add-button-shell",
  );
  const cardDeck = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card-deck",
  );
  const previousCardButtonShell = within(nodeElement).getByTestId(
    "spielwiese-agent-node-card-back-button-shell",
  );

  return {
    addCardButton,
    addCardButtonShell,
    addCardButtonTrigger,
    cardDeck,
    cardSwitcher,
    previousCardButton,
    previousCardButtonShell,
    previousCardButtonTrigger,
  };
}

function getCardNavigationChrome(nodeElement: HTMLElement, nodeId: string) {
  const {
    addCardButton,
    addCardButtonShell,
    addCardButtonTrigger,
    cardDeck,
    cardSwitcher,
    previousCardButton,
    previousCardButtonShell,
    previousCardButtonTrigger,
  } = getCardNavigationElements(nodeElement, nodeId);

  expect(
    within(nodeElement).getByRole("button", { name: `${nodeId} Model` }),
  ).toBeTruthy();
  expect(cardSwitcher.className).toContain("gap-0");
  expect(cardSwitcher.className).not.toContain("gap-1.5");
  expect(addCardButton.className).toContain("bg-transparent");
  expectCardNavigationButtonChrome(addCardButton);
  expect(addCardButtonShell.className).toContain("px-1.5");
  expect(previousCardButton.className).toContain("bg-transparent");
  expectCardNavigationButtonChrome(previousCardButton);
  expect(previousCardButtonShell.className).toContain("px-1.5");
  expect(previousCardButton.getAttribute("disabled")).toBe("");

  return {
    addCardButton,
    addCardButtonShell,
    addCardButtonTrigger,
    cardDeck,
    previousCardButton,
    previousCardButtonShell,
    previousCardButtonTrigger,
  };
}

function getDetachedUserCardNavigationChrome(nodeElement: HTMLElement) {
  const addCardButton = within(nodeElement).getByRole("button", {
    name: "Add a new card after vision-agent user",
  });
  const addCardButtonTrigger = within(nodeElement).getByTestId(
    "spielwiese-detached-user-card-add-button-trigger",
  );
  const previousCardButton = within(nodeElement).getByRole("button", {
    name: "Show previous card for vision-agent user",
  });
  const previousCardButtonTrigger = within(nodeElement).getByTestId(
    "spielwiese-detached-user-card-back-button-trigger",
  );
  const cardViewport = within(nodeElement).getByTestId(
    "spielwiese-detached-user-card-viewport",
  );
  const cardSwitcher = cardViewport.parentElement as HTMLElement;
  const addCardButtonShell = within(nodeElement).getByTestId(
    "spielwiese-detached-user-card-add-button-shell",
  );
  const cardDeck = within(nodeElement).getByTestId(
    "spielwiese-detached-user-card-deck",
  );
  const previousCardButtonShell = within(nodeElement).getByTestId(
    "spielwiese-detached-user-card-back-button-shell",
  );

  expect(cardSwitcher.className).toContain("gap-0");
  expectCardNavigationButtonChrome(addCardButton);
  expect(addCardButtonShell.className).toContain("px-1.5");
  expectCardNavigationButtonChrome(previousCardButton);
  expect(previousCardButtonShell.className).toContain("px-1.5");
  expect(previousCardButton.getAttribute("disabled")).toBe("");

  return {
    addCardButton,
    addCardButtonShell,
    addCardButtonTrigger,
    cardDeck,
    cardSwitcher,
    previousCardButton,
    previousCardButtonShell,
    previousCardButtonTrigger,
  };
}

function expectHiddenCardNavigationChrome(shell: HTMLElement) {
  expect(shell.className).toContain("opacity-0");
  expect(shell.className).toContain("pointer-events-none");
  expect(shell.className).not.toContain("opacity-100");
  expect(shell.className).not.toContain("pointer-events-auto");
}

function expectVisibleCardNavigationChrome(shell: HTMLElement) {
  expect(shell.className).toContain("opacity-100");
  expect(shell.className).toContain("pointer-events-auto");
  expect(shell.className).not.toContain("opacity-0");
  expect(shell.className).not.toContain("pointer-events-none");
}

function expectCardNavigationGroupHidden(
  chrome: Pick<
    ReturnType<typeof getCardNavigationChrome>,
    "addCardButtonShell" | "previousCardButtonShell"
  >,
) {
  expectHiddenCardNavigationChrome(chrome.addCardButtonShell);
  expectHiddenCardNavigationChrome(chrome.previousCardButtonShell);
}

function expectCardNavigationGroupVisible(
  chrome: Pick<
    ReturnType<typeof getCardNavigationChrome>,
    "addCardButtonShell" | "previousCardButtonShell"
  >,
) {
  expectVisibleCardNavigationChrome(chrome.addCardButtonShell);
  expectVisibleCardNavigationChrome(chrome.previousCardButtonShell);
}

function expectSecondaryCardVisible(visionNode: HTMLElement) {
  const secondaryCard = within(visionNode).getByTestId(
    "spielwiese-agent-node-secondary-card",
  );

  expect(
    within(visionNode).getByRole("button", { name: "vision-agent Model" }),
  ).toBeTruthy();
  expect(within(secondaryCard).getByDisplayValue("Vision Agent")).toBeTruthy();
  expect(
    within(secondaryCard).getByLabelText("vision-agent Instructions"),
  ).toBeTruthy();
}

describe("SpielwieseEditorCanvas node card navigation visibility", () => {
  it("reveals card navigation controls only for the hovered node", () => {
    renderCanvas();
    const agentNodes = screen.getAllByTestId("spielwiese-agent-node");
    const visionNode = agentNodes[0]!;
    const nutritionNode = agentNodes[1]!;
    const visionChrome = getCardNavigationChrome(visionNode, "vision-agent");
    const visionDetachedUserChrome =
      getDetachedUserCardNavigationChrome(visionNode);
    const nutritionChrome = getCardNavigationChrome(
      nutritionNode,
      "nutrition-agent",
    );

    expectCardNavigationGroupHidden(visionChrome);
    expectCardNavigationGroupHidden(visionDetachedUserChrome);
    expectCardNavigationGroupHidden(nutritionChrome);

    fireEvent.mouseEnter(visionDetachedUserChrome.cardSwitcher);

    expectCardNavigationGroupHidden(visionChrome);
    expectCardNavigationGroupVisible(visionDetachedUserChrome);
    expectCardNavigationGroupHidden(nutritionChrome);

    fireEvent.mouseLeave(visionDetachedUserChrome.cardSwitcher);
    fireEvent.mouseEnter(visionChrome.cardDeck);

    expectCardNavigationGroupVisible(visionChrome);
    expectCardNavigationGroupHidden(visionDetachedUserChrome);
    expectCardNavigationGroupHidden(nutritionChrome);

    fireEvent.mouseLeave(visionChrome.cardDeck);
    fireEvent.mouseEnter(nutritionChrome.cardDeck);

    expectCardNavigationGroupHidden(visionChrome);
    expectCardNavigationGroupHidden(visionDetachedUserChrome);
    expectCardNavigationGroupVisible(nutritionChrome);
  });

  it("keeps detached user card navigation hidden when only the user input is focused", () => {
    renderCanvas();
    const visionNode = screen.getAllByTestId("spielwiese-agent-node")[0]!;
    const visionDetachedUserChrome =
      getDetachedUserCardNavigationChrome(visionNode);
    const detachedUserInput = within(visionNode).getByLabelText(
      "vision-agent User message",
    );

    fireEvent.focus(detachedUserInput);

    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.addCardButtonShell,
    );
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.previousCardButtonShell,
    );
  });
});

describe("SpielwieseEditorCanvas node card navigation switching", () => {
  it("switches a node card into a matching secondary card and back again", () => {
    renderCanvas();
    const agentNodes = screen.getAllByTestId("spielwiese-agent-node");
    const nodeIds = ["vision-agent", "nutrition-agent", "coach-agent"];
    const visionNode = agentNodes[0];
    const {
      addCardButton,
      addCardButtonShell,
      cardDeck,
      previousCardButton,
      previousCardButtonShell,
    } = getCardNavigationChrome(visionNode!, "vision-agent");

    expect(agentNodes).toHaveLength(nodeIds.length);
    agentNodes.forEach((nodeElement, index) => {
      getCardNavigationChrome(nodeElement!, nodeIds[index]!);
    });

    fireEvent.mouseEnter(cardDeck);

    expectVisibleCardNavigationChrome(addCardButtonShell);
    expectVisibleCardNavigationChrome(previousCardButtonShell);

    fireEvent.click(addCardButton);

    expectSecondaryCardVisible(visionNode);
    expect(previousCardButton.getAttribute("disabled")).toBeNull();

    fireEvent.click(previousCardButton);

    expect(
      within(visionNode).getByRole("button", { name: "vision-agent Model" }),
    ).toBeTruthy();
    expect(
      within(visionNode).queryByTestId("spielwiese-agent-node-secondary-card"),
    ).toBeNull();
    expect(previousCardButton.getAttribute("disabled")).toBe("");
  });
});
