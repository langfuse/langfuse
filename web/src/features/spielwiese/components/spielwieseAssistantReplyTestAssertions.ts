import { within } from "@testing-library/react";
import { expectShadowedMessageFieldShell } from "./spielwieseEditorCanvasTestAssertions";

function expectAssistantReplyFieldShell(fieldShell: HTMLElement | null) {
  expectShadowedMessageFieldShell(fieldShell);
}

export function expectAssistantReplyCard(behaviorCard: HTMLElement) {
  const receivesLabel = within(behaviorCard).getByText("RECEIVES");
  const respondsLabel = within(behaviorCard).getByText("RESPONDS");
  const receivesRow = receivesLabel.parentElement;
  const respondsRow = respondsLabel.parentElement;
  const receivesFieldShell =
    receivesLabel.nextElementSibling as HTMLElement | null;
  const respondsFieldShell =
    respondsLabel.nextElementSibling as HTMLElement | null;
  const receivesTextarea = within(behaviorCard).getByLabelText(
    "vision-agent receives context",
  );
  const respondsTextarea = within(behaviorCard).getByLabelText(
    "vision-agent How the assistant should reply",
  );

  expect(within(behaviorCard).getByText("RECEIVES")).toBeTruthy();
  expect(within(behaviorCard).getByText("RESPONDS")).toBeTruthy();
  expect(behaviorCard.className).toContain("w-full");
  expect(behaviorCard.className).toContain("mt-3.5");
  expect(behaviorCard.className).toContain("ml-1");
  expect(behaviorCard.className).toContain("h-[104px]");
  expect(behaviorCard.className).toContain("max-h-[104px]");
  expect(behaviorCard.className).toContain("justify-start");
  expect(behaviorCard.className).toContain("gap-2.5");
  expect(behaviorCard.className).toContain("pr-1");
  expect(behaviorCard.className).not.toContain("rounded-xl");
  expect(behaviorCard.className).not.toContain("border-border/40");
  expect(behaviorCard.className).not.toContain("bg-transparent");
  expect(behaviorCard.firstElementChild?.className).not.toContain("divide-y");
  expect(receivesRow?.className).toContain("items-center");
  expect(respondsRow?.className).toContain("items-center");
  expectAssistantReplyFieldShell(receivesFieldShell);
  expectAssistantReplyFieldShell(respondsFieldShell);
  expect((receivesTextarea as HTMLTextAreaElement).value).toContain("[image]");
  expect(receivesTextarea.className).toContain("leading-7");
  expect(receivesTextarea.className).toContain("w-full");
  expect(receivesTextarea.className).toContain("rounded-[10px]");
  expect(receivesTextarea.className).toContain("bg-transparent");
  expect(respondsTextarea).toBeTruthy();
  expect(respondsTextarea.className).toContain("rounded-[10px]");
  expect(respondsTextarea.className).toContain("bg-transparent");
}
