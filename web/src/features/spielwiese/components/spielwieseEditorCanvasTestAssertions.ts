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
  expect(titleInput.className).toContain("w-auto");
  expect(titleInput.className).toContain("[field-sizing:content]");
  expect(titleControl.className).toContain("bg-[linear-gradient");
  expect(titleControl.className).toContain("rounded-[10px]");
  expect(titleControl.className).toContain("border-[rgba(0,0,0,0.08)]");
  expect(screen.queryByLabelText("vision-agent description")).toBeNull();
  expect(modelInput.className).toContain("w-auto");
  expect(modelInput.className).toContain("max-w-[14rem]");
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
  expect(detachedUserPromptSections?.className).toContain("pb-1");
}

export function expectDetachedUserRowChrome(
  detachedUserSections: HTMLElement,
  detachedUserRow: HTMLElement,
) {
  const detachedUserCompactButton = within(detachedUserRow).getByRole(
    "button",
    {
      name: "Minimize vision-agent User section",
    },
  );
  const detachedUserTextarea =
    within(detachedUserSections).getByLabelText("vision-agent User");
  const detachedUserToggle = within(detachedUserRow).getByRole("button", {
    name: "Toggle vision-agent User section",
  });
  const detachedUserHeader =
    detachedUserRow.firstElementChild as HTMLElement | null;
  const uploadFileTag = within(detachedUserRow).getByRole("button", {
    name: "Upload file",
  });
  const uploadTagContent = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-upload-tag-content",
  );
  const uploadSuffixIcon = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-upload-suffix-icon",
  );
  const uploadThumb = within(detachedUserRow).getByTestId(
    "spielwiese-detached-user-upload-thumb",
  );
  const uploadThumbImage = uploadThumb.querySelector("img");
  const detachedUserField = detachedUserTextarea.parentElement;

  expectDetachedUserRowShell({
    detachedUserCompactButton,
    detachedUserHeader,
    detachedUserRow,
    detachedUserSections,
    detachedUserTextarea,
    detachedUserToggle,
  });
  expectDetachedUploadTag({
    uploadFileTag,
    uploadSuffixIcon,
    uploadTagContent,
    uploadThumb,
    uploadThumbImage,
  });
  expectShadowedMessageFieldShell(detachedUserField);
  expect(detachedUserField?.className).toContain("min-h-9");
  expect(detachedUserField?.className).toContain("items-center");
  expect(detachedUserTextarea.className).toContain("min-h-6");
  expect(
    within(detachedUserSections).getByTestId("vision-agent-user-tag-icon"),
  ).toBeTruthy();
}

function expectDetachedUserRowShell({
  detachedUserCompactButton,
  detachedUserHeader,
  detachedUserRow,
  detachedUserSections,
  detachedUserTextarea,
  detachedUserToggle,
}: {
  detachedUserCompactButton: HTMLElement;
  detachedUserHeader: HTMLElement | null;
  detachedUserRow: HTMLElement;
  detachedUserSections: HTMLElement;
  detachedUserTextarea: HTMLElement;
  detachedUserToggle: HTMLElement;
}) {
  expect(detachedUserTextarea).toBeTruthy();
  expectDetachedUserShell(detachedUserSections);
  expect(detachedUserRow.className).toContain("border-border/40");
  expect(detachedUserRow.className).toContain("bg-background/96");
  expect(detachedUserRow.className).toContain("overflow-visible");
  expect(detachedUserRow.className).toContain(
    "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]",
  );
  expect(detachedUserRow.className).not.toContain("shadow-[");
  expect(detachedUserRow.contains(detachedUserTextarea)).toBe(false);
  expect(detachedUserSections.contains(detachedUserTextarea)).toBe(true);
  expect(
    detachedUserToggle.querySelector("[data-prefix='true']")?.className,
  ).toContain("size-5");
  expect(detachedUserCompactButton.className).toContain("h-7");
  expect(detachedUserCompactButton.className).toContain("w-7");
  expect(detachedUserCompactButton.getAttribute("aria-pressed")).toBe("false");
  expect(detachedUserHeader?.lastElementChild?.lastElementChild).toBe(
    detachedUserCompactButton,
  );
  expect(detachedUserHeader?.className).not.toContain("min-h-6");
  expect(detachedUserHeader?.className).not.toContain("py-0.5");
}

function expectDetachedUploadTag({
  uploadFileTag,
  uploadSuffixIcon,
  uploadTagContent,
  uploadThumb,
  uploadThumbImage,
}: {
  uploadFileTag: HTMLElement;
  uploadSuffixIcon: HTMLElement;
  uploadTagContent: HTMLElement;
  uploadThumb: HTMLElement;
  uploadThumbImage: HTMLImageElement | null;
}) {
  expect(uploadFileTag.className).toContain("h-6");
  expect(uploadFileTag.className).toContain("overflow-visible");
  expect(uploadFileTag.className).toContain("gap-1.5");
  expect(uploadFileTag.className).toContain("pl-0");
  expect(uploadFileTag.className).toContain("pr-1.5");
  expect(uploadFileTag.textContent).toContain("Upload file");
  expect(uploadTagContent.className).toContain("items-center");
  expect(uploadTagContent.className).toContain("gap-1.25");
  expect(uploadTagContent.children[1]).toBe(uploadSuffixIcon);
  expect(uploadTagContent.children[2]?.textContent).toBe("Upload file");
  expect(uploadThumb.className).toContain("-ml-0.5");
  expect(uploadThumb.className).toContain("size-[1.375rem]");
  expect(uploadThumb.className).toContain("rounded-[7px]");
  expect(uploadSuffixIcon.getAttribute("class")).toContain("size-3");
  expect(uploadSuffixIcon.getAttribute("class")).toContain(
    "text-foreground/32",
  );
  expect(uploadThumb.className).toContain(
    "shadow-[0_1px_2px_rgba(0,0,0,0.22)]",
  );
  expect(uploadThumb.className).toContain(
    "after:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.98)]",
  );
  expect(uploadThumbImage?.getAttribute("src")).toContain(
    "upload-file-thumb.webp",
  );
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

function expectAssistantReplyFieldShell(fieldShell: HTMLElement | null) {
  expectShadowedMessageFieldShell(fieldShell);
}

export function expectShadowedMessageFieldShell(
  fieldShell: HTMLElement | null,
) {
  expect(fieldShell).toBeTruthy();
  expect(fieldShell?.className).toContain("w-full");
  expect(fieldShell?.className).toContain("rounded-[10px]");
  expect(fieldShell?.className).toContain("border-[rgba(0,0,0,0.05)]");
  expect(fieldShell?.className).toContain("bg-white");
  expect(fieldShell?.className).toContain(assistantReplyCardShadowClassName);
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
