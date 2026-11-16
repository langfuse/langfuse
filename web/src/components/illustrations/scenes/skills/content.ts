type SkillsUse = {
  /** How it gets there: cli, sdk, mcp. */
  via: string;
  /** What reads it: the folder the CLI installs into, the SDK call, the agent's tool. */
  target: string;
};

export type SkillsContent = {
  /** The skill, as its SKILL.md frontmatter names it: lowercase words joined by hyphens. */
  name: string;
  /** The version a run creates: 3 reads v3. Every version holds the whole folder. */
  version: number;
  /** The label moved to it to deploy it, such as production or staging (latest follows the newest by itself). */
  label: string;
  /** The files it holds, as paths in its folder, SKILL.md first; up to four. */
  files: string[];
  /** The ways it's used, one row each, up to three: a coding agent's install, an app's fetch, a chat agent's tool call. */
  uses: SkillsUse[];
};

/** Characters per slot before an ellipsis; the frame is sized for these. */
export const SKILLS_LIMITS = {
  name: 14,
  version: 6,
  label: 10,
  file: 26,
  via: 4,
  target: 14,
  files: 4,
  uses: 3,
} as const;

export const SKILLS_DEFAULTS: SkillsContent = {
  name: "refund-policy",
  version: 3,
  label: "production",
  files: ["SKILL.md", "references/eligibility.md", "scripts/order-lookup.py"],
  uses: [
    { via: "cli", target: ".agents/skills" },
    { via: "sdk", target: "skills.get" },
    { via: "mcp", target: "loadSkill" },
  ],
};
