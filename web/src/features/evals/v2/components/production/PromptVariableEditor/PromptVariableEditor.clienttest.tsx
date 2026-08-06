import { render } from "@testing-library/react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

import { PromptVariableEditor } from "./PromptVariableEditor";

describe("PromptVariableEditor", () => {
  it("uses the app sans-serif font for natural-language prompts", () => {
    const { container } = render(
      <PromptVariableEditor
        value="Evaluate this response"
        onChange={() => undefined}
        onVariableClick={() => undefined}
      />,
    );

    const scroller = container.querySelector<HTMLElement>(".cm-scroller");

    expect(scroller).not.toBeNull();
    expect(getComputedStyle(scroller!).fontFamily).toBe("var(--font-sans)");
  });
});
