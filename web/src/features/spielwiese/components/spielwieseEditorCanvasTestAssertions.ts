import { screen, within } from "@testing-library/react";

const assistantReplyCardShadowClassName = "shadow-[0_0_0_3px_rgba(0,0,0,0.03)]";

export function expectInlineEditingShell({
  modelInput,
  systemInput,
  titleInput,
  titleControl,
  toolCreatorButton,
}: {
  modelInput: HTMLElement;
  systemInput: HTMLElement;
  titleInput: HTMLElement;
  titleControl: HTMLElement;
  toolCreatorButton: HTMLElement;
}) {
  expect(screen.queryByLabelText("vision-agent step")).toBeNull();
  expect(titleInput.className).toContain("w-full");
  expect(titleControl.className).toContain("bg-[linear-gradient");
  expect(titleControl.className).toContain("rounded-[10px]");
  expect(titleControl.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(screen.queryByLabelText("vision-agent description")).toBeNull();
  expect(modelInput.className).toContain("min-w-[11rem]");
  expect(titleControl.contains(modelInput)).toBe(true);
  expect(systemInput.className).toContain("[field-sizing:content]");
  expect(toolCreatorButton.textContent).toContain("any");
  expect(screen.queryByLabelText("vision-agent tools")).toBeNull();
  expect(systemInput.getAttribute("rows")).toBe("1");
}

function expectDetachedUserShell(detachedUserSections: HTMLElement) {
  const detachedUserPromptSections = detachedUserSections.firstElementChild;

  expect(detachedUserSections.className).toContain("[--node-shell-gap:2px]");
  expect(detachedUserSections.className).toContain(
    "[--node-shell-radius:16px]",
  );
  expect(detachedUserSections.className).toContain(
    "rounded-(--node-shell-radius)",
  );
  expect(detachedUserSections.className).toContain("border");
  expect(detachedUserSections.className).toContain("bg-[#FBFBFB]");
  expect(detachedUserSections.className).toContain("px-[2px]");
  expect(detachedUserSections.className).toContain("pt-[2px]");
  expect(detachedUserSections.className).toContain("pb-[2px]");
  expect(detachedUserPromptSections?.className).toContain("pt-0");
}

export function expectDetachedUserRowChrome(
  detachedUserSections: HTMLElement,
  detachedUserRow: HTMLElement,
) {
  const detachedUserTextarea =
    within(detachedUserSections).getByLabelText("vision-agent User");
  const detachedUserField = detachedUserTextarea.parentElement;

  expect(detachedUserTextarea).toBeTruthy();
  expectDetachedUserShell(detachedUserSections);
  expect(detachedUserRow.className).toContain("border-border/40");
  expect(detachedUserRow.className).toContain("bg-background/96");
  expect(detachedUserRow.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(detachedUserRow.className).not.toContain("shadow-[");
  expect(detachedUserRow.contains(detachedUserTextarea)).toBe(false);
  expect(detachedUserSections.contains(detachedUserTextarea)).toBe(true);
  expect(detachedUserField?.className).toContain("bg-[oklch(0.97_0.002_95)]");
  expect(detachedUserField?.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(
    within(detachedUserSections).getByTestId("vision-agent-user-tag-icon"),
  ).toBeTruthy();
}

export function expectAttioSectionChip(
  instructionsToggle: HTMLElement,
  nodeCard: HTMLElement,
) {
  expect(instructionsToggle.className).toContain("bg-transparent");
  expect(instructionsToggle.className).toContain("border-0");
  expect(instructionsToggle.className).toContain("px-0");
  expect(instructionsToggle.className).toContain("py-0");
  expect(
    instructionsToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("size-5");
  expect(
    within(nodeCard)
      .getByTestId("vision-agent-system-icon")
      .getAttribute("class"),
  ).toContain("size-3");
}

export function expectAssistantReplyCard(behaviorCard: HTMLElement) {
  expect(within(behaviorCard).getByText("RECEIVES")).toBeTruthy();
  expect(within(behaviorCard).getByText("RESPONDS")).toBeTruthy();
  expect(behaviorCard.className).toContain("w-full");
  expect(behaviorCard.className).toContain("mt-4");
  expect(behaviorCard.className).toContain("ml-1");
  expect(behaviorCard.className).toContain("h-[104px]");
  expect(behaviorCard.className).toContain("max-h-[104px]");
  expect(behaviorCard.className).toContain("rounded-t-[6px]");
  expect(behaviorCard.className).toContain("border-[rgba(0,0,0,0.05)]");
  expect(behaviorCard.className).toContain("bg-white");
  expect(behaviorCard.className).toContain("p-4");
  expect(behaviorCard.className).toContain(assistantReplyCardShadowClassName);
  expect(behaviorCard.className).toContain("gap-3.5");
  expect(behaviorCard.firstElementChild?.className).not.toContain("divide-y");
  expect(
    (
      within(behaviorCard).getByLabelText(
        "vision-agent receives context",
      ) as HTMLTextAreaElement
    ).value,
  ).toContain("[image]");
  expect(
    within(behaviorCard).getByLabelText("vision-agent receives context")
      .className,
  ).toContain("leading-7");
  expect(
    within(behaviorCard).getByLabelText("vision-agent receives context")
      .className,
  ).toContain("w-full");
  expect(
    within(behaviorCard).getByLabelText(
      "vision-agent How the assistant should reply",
    ),
  ).toBeTruthy();
}
