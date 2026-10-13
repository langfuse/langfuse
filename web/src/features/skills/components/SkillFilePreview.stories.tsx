import preview from "../../../../.storybook/preview";
import { expect, userEvent, within } from "storybook/test";
import { SkillFilePreview } from "./SkillFilePreview";

const meta = preview.meta({ component: SkillFilePreview });

export const Skill = meta.story({
  args: {
    path: "SKILL.md",
    content: `---
name: review-code
description: |
  Review a change for correctness.
  Use when preparing a pull request.
allowed-tools:
  - Read
  - Bash
metadata:
  author: Example team
  version: 2
---

# Review instructions

1. Read the changed files.
2. **Check correctness** and report actionable findings.

## Output

| Field | Description |
| --- | --- |
| Summary | What changed |
| Findings | Regressions to fix |
`,
  },
});

export const Markdown = meta.story({
  args: {
    path: "references/README.MD",
    content: "# Reference\n\nRead the **instructions** and run `pnpm test`.",
  },
});

export const Python = meta.story({
  args: {
    path: "scripts/review.py",
    content: 'def review(path: str):\n    print(f"Reviewing {path}")\n',
  },
});

export const PreservesFrontmatter = meta.story({
  name: "(Test) Switches between front matter preview and raw source",
  args: {
    path: "SKILL.md",
    content:
      "---\r\nname: review-code\r\nmetadata:\r\n  enabled: false\r\n  retries: 0\r\n---\r\n# Instructions\r\n\r\n---\r\n\r\nRead **carefully**.",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const metadata = canvas.getByRole("region", { name: "Skill front matter" });
    await expect(metadata).toHaveTextContent("review-code");
    await expect(metadata).toHaveTextContent("enabled: false");
    await expect(metadata).toHaveTextContent("retries: 0");
    await expect(
      canvas.getByRole("heading", { name: "Instructions" }),
    ).toBeVisible();
    await expect(canvas.getByRole("separator")).toBeVisible();
    await expect(canvas.getByText("carefully").tagName).toBe("STRONG");
    await userEvent.click(canvas.getByRole("tab", { name: "Raw" }));
    await expect(
      canvas.queryByRole("region", { name: "Skill front matter" }),
    ).toBeNull();
    await expect(
      canvas
        .getByRole("tabpanel")
        .querySelector("pre")
        ?.textContent?.replace(/\r?\n/g, ""),
    ).toBe(args.content.replace(/\r?\n/g, ""));
    await userEvent.click(canvas.getByRole("tab", { name: "Preview" }));
    await expect(
      canvas.getByRole("region", { name: "Skill front matter" }),
    ).toBeVisible();
  },
});

export const InvalidFrontmatter = meta.story({
  name: "(Test) Invalid frontmatter preserves source",
  args: {
    path: "SKILL.md",
    content: "---\nname: [unclosed\n---\n# Instructions\nKeep every line.",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Showing the original source",
    );
    await expect(canvasElement.querySelector("pre")?.textContent).toBe(
      args.content,
    );
  },
});

export const HtmlSource = meta.story({
  name: "(Test) HTML stays source",
  args: {
    path: "template.html",
    content: '<h1>Template</h1>\n<script>alert("example")</script>',
  },
  play: async ({ canvasElement, args }) => {
    await expect(
      within(canvasElement).queryByRole("heading", { name: "Template" }),
    ).toBeNull();
    await expect(canvasElement.querySelector("pre script")).toBeNull();
    await expect(canvasElement.querySelector("pre")?.textContent).toBe(
      args.content.replace(/\n/g, ""),
    );
  },
});
