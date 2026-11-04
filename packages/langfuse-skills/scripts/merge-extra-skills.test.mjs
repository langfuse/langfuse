import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyExtraFiles,
  insertReferenceBullet,
  readExtraFiles,
} from "./merge-extra-skills.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const skillMd = [
  "## Use case specific references",
  "",
  "- optimizing the cost of an LLM application: references/cost-optimization.md",
  "- submitting feedback about this skill: references/skill-feedback.md",
  "",
].join("\n");

test("inserts the production review bullet before skill feedback", () => {
  const updated = insertReferenceBullet(
    skillMd,
    "- daily production review of volumes, scores, and topics: references/production-review.md",
  );

  const lines = updated.split("\n");
  const review = lines.findIndex((line) =>
    line.includes("references/production-review.md"),
  );
  const feedback = lines.findIndex((line) =>
    line.includes("references/skill-feedback.md"),
  );
  assert.ok(review >= 0);
  assert.ok(review < feedback);
  assert.equal(insertReferenceBullet(updated, lines[review]), updated);
});

test("keeps an upstream copy of the same skill path", () => {
  const bundles = [
    {
      name: "langfuse",
      files: [
        { path: "SKILL.md", bytes: Buffer.from(skillMd) },
        {
          path: "references/production-review.md",
          bytes: Buffer.from("upstream"),
        },
      ],
    },
  ];
  const extras = new Map([
    [
      "langfuse",
      [
        {
          path: "references/production-review.md",
          bytes: Buffer.from("local"),
        },
      ],
    ],
  ]);

  const [bundle] = applyExtraFiles(bundles, extras);
  const skill = bundle.files.find(
    (file) => file.path === "references/production-review.md",
  );
  assert.equal(skill.bytes.toString("utf8"), "upstream");
  assert.equal(
    bundle.files
      .find((file) => file.path === "SKILL.md")
      .bytes.toString("utf8"),
    skillMd,
  );
});

test("adds the local production review skill and index bullet", () => {
  const extras = readExtraFiles(packageRoot);
  const files = extras.get("langfuse");
  assert.ok(
    files.some((file) => file.path === "references/production-review.md"),
  );

  const [bundle] = applyExtraFiles(
    [
      {
        name: "langfuse",
        files: [{ path: "SKILL.md", bytes: Buffer.from(skillMd) }],
      },
      { name: "migrate-to-langfuse", files: [] },
    ],
    extras,
  );

  assert.equal(bundle.name, "langfuse");
  const markdown = bundle.files
    .find((file) => file.path === "SKILL.md")
    .bytes.toString("utf8");
  assert.match(markdown, /references\/production-review\.md/);
  assert.ok(
    bundle.files.some(
      (file) => file.path === "references/production-review.md",
    ),
  );
});

test("the bundled catalog exposes the production review skill", () => {
  const { LANGFUSE_SKILLS } = require("../src/generated/skills.js");
  const skill = LANGFUSE_SKILLS.find(
    (entry) => entry.name === "langfuse-production-review",
  );

  assert.ok(skill);
  assert.match(skill.description, /production review/i);
  assert.match(skill.instructions, /## What counts as an issue/);
  assert.match(skill.instructions, /## Slack/);
  assert.match(skill.instructions, /## Report/);
  assert.match(skill.instructions, /\*\*Next\.\*\*/);
  assert.ok(skill.description.length <= 1024);
});
