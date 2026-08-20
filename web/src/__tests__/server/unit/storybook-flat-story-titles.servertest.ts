import { assertNoExplicitStoryTitle } from "../../../../.storybook/storybook-flat-story-titles";

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
