import { render, screen } from "@testing-library/react";
import { SpielwiesePromptCanvas } from "./SpielwiesePromptCanvas";

describe("SpielwiesePromptCanvas", () => {
  const promptCanvas = {
    title: "Vision Agent",
    sections: [
      {
        id: "user",
        label: "User",
        content: ["[image]"],
      },
      {
        id: "system",
        label: "System",
        content: ["Return only JSON."],
      },
    ],
  };

  it("renders a centered document editor surface", () => {
    render(<SpielwiesePromptCanvas promptCanvas={promptCanvas} />);

    expect(screen.getByTestId("spielwiese-prompt-canvas").className).toContain(
      "h-full",
    );
    expect(screen.getByTestId("spielwiese-prompt-canvas").className).toContain(
      "overflow-hidden",
    );
    expect(screen.getByTestId("spielwiese-document-editor")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-editor-body")).toBeTruthy();
  });

  it("renders the body as one editable canvas", () => {
    render(<SpielwiesePromptCanvas promptCanvas={promptCanvas} />);

    expect(
      screen
        .getByTestId("spielwiese-editor-body")
        .getAttribute("contenteditable"),
    ).toBe("true");
    expect(screen.queryByTestId("spielwiese-editor-title")).toBeNull();
    expect(screen.queryByText("Page Title")).toBeNull();
  });

  it("renders the prompt as one continuous canvas without section labels", () => {
    render(<SpielwiesePromptCanvas promptCanvas={promptCanvas} />);

    expect(screen.queryByText("User:")).toBeNull();
    expect(screen.queryByText("System:")).toBeNull();
    expect(screen.getByText("[image]")).toBeTruthy();
    expect(screen.getByText("Return only JSON.")).toBeTruthy();
  });
});
