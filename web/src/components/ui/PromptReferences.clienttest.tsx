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
});
