// @vitest-environment node

import { describe, expect, it } from "vitest";
import { project, textWidth } from "../../engine/projection";
import { SKILLS_DEFAULTS, SKILLS_LIMITS, type SkillsContent } from "./content";
import { layoutSkills } from "./layout";

const layoutOf = (content: Partial<SkillsContent> = {}) =>
  layoutSkills({ ...SKILLS_DEFAULTS, ...content });

describe("layoutSkills", () => {
  it("names the skill, its version, its files, the label it moves to and each way it's used", () => {
    expect(layoutOf().ariaLabel).toBe(
      "A skill in Langfuse: refund-policy v3, with SKILL.md, references/eligibility.md, scripts/order-lookup.py, moves to production and reaches .agents/skills (cli), skills.get (sdk), loadSkill (mcp)",
    );
  });

  it("deploys once its files have landed, then reaches each use in turn", () => {
    const { hero, files, targets } = layoutOf();

    expect(hero.pressAt).toBeGreaterThan(files.at(-1)!.at);
    expect(hero.tagChip.at).toBeGreaterThan(hero.pressAt);
    expect(targets[0]!.departAt).toBeGreaterThan(hero.pressAt);
    targets
      .slice(1)
      .forEach((target, index) =>
        expect(target.arriveAt).toBeGreaterThan(targets[index]!.arriveAt),
      );
  });

  it("keeps every use clear of the raised skill, whose sides hang below its face", () => {
    const { hero, targets } = layoutOf();
    const faceBottom = hero.face.y + hero.face.height;
    targets.forEach(({ card }) => {
      // At the card's left end, the hero's front edge hangs its depth below the face; the card starts 6 px past it
      const [, frontEdge] = project([card.x, faceBottom]);
      const [, cardTop] = project([card.x, card.y]);
      expect(cardTop).toBeGreaterThan(frontEdge + hero.depth + 6);
    });
  });

  it("keeps every file path on the skill's face, a long one cut to fit", () => {
    const path = "references/eligibility/very-long-folder/guide.md";
    const { hero, files, fileSize } = layoutOf({ files: ["SKILL.md", path] });

    expect(files[1]!.path.full).toBe(path);
    files.forEach((file) =>
      expect(file.textX + textWidth(file.path.text, fileSize)).toBeLessThan(
        hero.face.width,
      ),
    );
  });

  it("draws at most its limits of files and uses, their text in one column past the widest chip", () => {
    const { files, targets } = layoutOf({
      files: Array.from({ length: 6 }, (_, i) => `file-${i}.md`),
      uses: Array.from({ length: 5 }, (_, i) => ({
        via: i % 2 ? "cli" : "http",
        target: `.agent-${i}/skills`,
      })),
    });

    expect(files).toHaveLength(SKILLS_LIMITS.files);
    expect(targets).toHaveLength(SKILLS_LIMITS.uses);
    expect(new Set(targets.map(({ textX }) => textX)).size).toBe(1);
  });
});
