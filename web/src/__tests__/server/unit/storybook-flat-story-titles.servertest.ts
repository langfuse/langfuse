import {
  assertNoExplicitStoryTitle,
  flatStoryTitle,
} from "../../../../.storybook/storybook-flat-story-titles";

describe("assertNoExplicitStoryTitle", () => {
  it("rejects explicit story titles", () => {
    expect(() =>
      assertNoExplicitStoryTitle(
        'const meta = preview.meta({ title: "CustomTitle", component });',
        "/components/Example.stories.tsx",
      ),
    ).toThrowError(
      "Explicit Storybook titles are not allowed in /components/Example.stories.tsx",
    );
  });

  it("allows inferred story titles", () => {
    expect(() =>
      assertNoExplicitStoryTitle(
        "const meta = preview.meta({ component });",
        "/components/Example.stories.tsx",
      ),
    ).not.toThrow();
  });
});

describe("flatStoryTitle", () => {
  // The app's own groups live in main.ts; this exercises the mechanism.
  const groups = [
    {
      directory: "src/features/example/components",
      titlePrefix: "Features",
    },
  ];

  it("groups stories from configured directories", () => {
    expect(
      flatStoryTitle(
        "/repo/web/src/features/example/components/Stepper/Stepper.stories.tsx",
        groups,
      ),
    ).toBe("Features/Stepper");
  });

  it("preserves nested component groups without source-only directories", () => {
    expect(
      flatStoryTitle(
        "/repo/web/src/features/example/components/EvaluatorGalleryView/components/EvaluatorGallerySection/components/EvaluatorTemplateRow/EvaluatorTemplateRow.stories.tsx",
        groups,
      ),
    ).toBe(
      "Features/EvaluatorGalleryView/EvaluatorGallerySection/EvaluatorTemplateRow",
    );
  });

  it("keeps a distinct story name beneath its component directory", () => {
    expect(
      flatStoryTitle(
        "/repo/web/src/features/example/components/TestResultPanel/TestResultPanelView.stories.tsx",
        groups,
      ),
    ).toBe("Features/TestResultPanel/TestResultPanelView");
  });

  it("keeps stories outside configured directories flat", () => {
    expect(
      flatStoryTitle("/repo/web/src/components/ui/example.stories.tsx", groups),
    ).toBe("example");
  });

  it("matches configured directories in Windows paths", () => {
    expect(
      flatStoryTitle(
        "C:\\repo\\web\\src\\features\\example\\components\\Stepper\\Stepper.stories.tsx",
        groups,
      ),
    ).toBe("Features/Stepper");
  });
});
