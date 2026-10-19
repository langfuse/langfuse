import { render } from "@testing-library/react";
import { extractVariables } from "@langfuse/shared";
import { renderRichPromptContent } from "@/src/components/ui/PromptReferences";

describe("renderRichPromptContent", () => {
  it("preserves triple-brace prompt variable text in rich prompt rendering", () => {
    const { container } = render(
      <>{renderRichPromptContent("Use {{{placeholder}}} here")}</>,
    );

    expect(container.textContent).toBe("Use {{{placeholder}}} here");
  });

  it("extracts the inner variable from triple-brace prompt variables", () => {
    expect(extractVariables("Use {{{placeholder}}} here")).toEqual([
      "placeholder",
    ]);
  });

  it("renders variables with surrounding whitespace as valid", () => {
    const { container } = render(
      <>{renderRichPromptContent("Hello {{ name }}")}</>,
    );

    expect(container.textContent).toBe("Hello {{ name }}");
    const varSpan = container.querySelector("span[dir='ltr']");
    expect(varSpan).toBeInTheDocument();
    expect(varSpan).toHaveClass("text-primary-accent");
    expect(varSpan).not.toHaveClass("text-destructive");
  });
});
