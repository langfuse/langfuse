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
  const previousCardButton = within(nodeElement).getByRole("button", {
    name: `Show previous card for ${nodeId}`,
  });
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
    cardDeck,
    cardSwitcher,
    previousCardButton,
    previousCardButtonShell,
  };
}

function getCardNavigationChrome(nodeElement: HTMLElement, nodeId: string) {
  const {
    addCardButton,
    addCardButtonShell,
    cardDeck,
    cardSwitcher,
    previousCardButton,
    previousCardButtonShell,
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
    cardDeck,
    previousCardButton,
    previousCardButtonShell,
  };
}

function getDetachedUserCardNavigationChrome(nodeElement: HTMLElement) {
  const addCardButton = within(nodeElement).getByRole("button", {
    name: "Add a new card after vision-agent user",
  });
  const previousCardButton = within(nodeElement).getByRole("button", {
    name: "Show previous card for vision-agent user",
  });
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
    cardDeck,
    cardSwitcher,
    previousCardButton,
    previousCardButtonShell,
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

    expectHiddenCardNavigationChrome(visionChrome.addCardButtonShell);
    expectHiddenCardNavigationChrome(visionChrome.previousCardButtonShell);
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.addCardButtonShell,
    );
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.previousCardButtonShell,
    );
    expectHiddenCardNavigationChrome(nutritionChrome.addCardButtonShell);
    expectHiddenCardNavigationChrome(nutritionChrome.previousCardButtonShell);

    fireEvent.mouseEnter(visionDetachedUserChrome.cardSwitcher);

    expectHiddenCardNavigationChrome(visionChrome.addCardButtonShell);
    expectHiddenCardNavigationChrome(visionChrome.previousCardButtonShell);
    expectVisibleCardNavigationChrome(
      visionDetachedUserChrome.addCardButtonShell,
    );
    expectVisibleCardNavigationChrome(
      visionDetachedUserChrome.previousCardButtonShell,
    );
    expectHiddenCardNavigationChrome(nutritionChrome.addCardButtonShell);
    expectHiddenCardNavigationChrome(nutritionChrome.previousCardButtonShell);

    fireEvent.mouseLeave(visionDetachedUserChrome.cardSwitcher);
    fireEvent.mouseEnter(visionChrome.cardDeck);

    expectVisibleCardNavigationChrome(visionChrome.addCardButtonShell);
    expectVisibleCardNavigationChrome(visionChrome.previousCardButtonShell);
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.addCardButtonShell,
    );
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.previousCardButtonShell,
    );
    expectHiddenCardNavigationChrome(nutritionChrome.addCardButtonShell);
    expectHiddenCardNavigationChrome(nutritionChrome.previousCardButtonShell);

    fireEvent.mouseLeave(visionChrome.cardDeck);
    fireEvent.mouseEnter(nutritionChrome.cardDeck);

    expectHiddenCardNavigationChrome(visionChrome.addCardButtonShell);
    expectHiddenCardNavigationChrome(visionChrome.previousCardButtonShell);
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.addCardButtonShell,
    );
    expectHiddenCardNavigationChrome(
      visionDetachedUserChrome.previousCardButtonShell,
    );
    expectVisibleCardNavigationChrome(nutritionChrome.addCardButtonShell);
    expectVisibleCardNavigationChrome(nutritionChrome.previousCardButtonShell);
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
