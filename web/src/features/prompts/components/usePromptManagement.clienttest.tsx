import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeExamples } from "@/src/features/prompts/components/code-snippets";

const mockCodeSnippets = {
  Python: {
    langCode: "py",
    commentChar: "#",
    snippets: [
      `prompt = langfuse.get_prompt("test-prompt-1", label="latest")`,
      `prompt = langfuse.get_prompt("test-prompt-1", version=1)`,
    ],
  },
  "JS/TS": {
    langCode: "js",
    commentChar: "//",
    snippets: [
      `const prompt = await langfuse.getPrompt("test-prompt-1", undefined, {label: "latest"});`,
      `const prompt = await langfuse.getPrompt("test-prompt-1", 1);`,
    ],
  },
};

const mockCodeDescriptions = [
  "Fetch the latest production version",
  "Fetch by version",
];

describe("CodeExamples component", () => {
  test("renders code snippets with descriptions for Python", async () => {
    render(
      <CodeExamples
        title="Code samples for prompt management"
        snippets={mockCodeSnippets}
        descriptions={mockCodeDescriptions}
        docUrl="https://langfuse.com/docs/prompts"
      />,
    );

    // Opens the accordion UI
    fireEvent.click(screen.getByText(/Code samples for prompt management/i));

    // Checks that the language-specific tab UI buttons are present
    expect(screen.getByText("Python")).toBeTruthy();
    expect(screen.getByText("JS/TS")).toBeTruthy();

    // Tests if the Python snippets are rendered correctly
    const pythonSnippets = screen.getAllByText("get_prompt", { exact: false });
    expect(pythonSnippets.length).toBe(2);
  });
});
