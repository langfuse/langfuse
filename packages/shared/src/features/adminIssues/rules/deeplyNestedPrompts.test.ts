import { beforeEach, describe, expect, it, vi } from "vitest";

const { promptFindMany, dependencyFindMany } = vi.hoisted(() => ({
  promptFindMany: vi.fn(),
  dependencyFindMany: vi.fn(),
}));

vi.mock("../../../db", () => ({
  prisma: {
    prompt: { findMany: promptFindMany },
    promptDependency: { findMany: dependencyFindMany },
  },
}));

import {
  deeplyNestedPromptsRule,
  findDeeplyNestedPrompts,
} from "./deeplyNestedPrompts";

const prompt = (name: string, version: number, labels: string[] = []) => ({
  id: `${name}@${version}`,
  name,
  version,
  labels,
});

const byLabel = (parent: string, child: string, label = "production") => ({
  parentId: parent,
  childName: child,
  childLabel: label,
  childVersion: null,
});

// root@1 -> a -> b -> c -> d: four levels below the root
const chainPrompts = [
  prompt("root", 1, ["production"]),
  prompt("a", 1, ["production"]),
  prompt("b", 1, ["production"]),
  prompt("c", 1, ["production"]),
  prompt("d", 1, ["production"]),
];
const chainDependencies = [
  byLabel("root@1", "a"),
  byLabel("a@1", "b"),
  byLabel("b@1", "c"),
  byLabel("c@1", "d"),
];

describe("findDeeplyNestedPrompts", () => {
  it("reports only the outermost prompt of a deep chain", () => {
    expect(findDeeplyNestedPrompts(chainPrompts, chainDependencies, 3)).toEqual(
      [{ name: "root", version: 1, depth: 4 }],
    );
  });

  it("does not report graphs shallower than the threshold", () => {
    expect(
      findDeeplyNestedPrompts(chainPrompts, chainDependencies.slice(1), 4),
    ).toEqual([]);
  });

  it("follows version pins and label lookups to the referenced version", () => {
    const prompts = [
      prompt("root", 1, ["production"]),
      prompt("mid", 1),
      prompt("mid", 2, ["production"]),
      prompt("leaf", 1, ["production"]),
      prompt("deep", 1, ["production"]),
    ];
    const dependencies = [
      // depth 3 is reachable only through the version pin to mid@1
      {
        parentId: "root@1",
        childName: "mid",
        childLabel: null,
        childVersion: 1,
      },
      byLabel("mid@1", "leaf"),
      byLabel("leaf@1", "deep"),
    ];
    expect(findDeeplyNestedPrompts(prompts, dependencies, 3)).toEqual([
      { name: "root", version: 1, depth: 3 },
    ]);
  });

  it("ignores versions without labels as roots", () => {
    const prompts = chainPrompts.map((p) =>
      p.name === "root" ? { ...p, labels: [] } : p,
    );
    expect(findDeeplyNestedPrompts(prompts, chainDependencies, 3)).toEqual([
      { name: "a", version: 1, depth: 3 },
    ]);
  });

  it("terminates on cycles and dangling references", () => {
    const prompts = [prompt("x", 1, ["production"]), prompt("y", 1)];
    const dependencies = [
      { parentId: "x@1", childName: "y", childLabel: null, childVersion: 1 },
      {
        parentId: "y@1",
        childName: "x",
        childLabel: "production",
        childVersion: null,
      },
      byLabel("y@1", "missing"),
    ];
    expect(() =>
      findDeeplyNestedPrompts(prompts, dependencies, 3),
    ).not.toThrow();
  });
});

describe("deeplyNestedPromptsRule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("scopes queries to the project and links each issue to its prompt", async () => {
    promptFindMany.mockResolvedValue(chainPrompts);
    dependencyFindMany.mockResolvedValue(chainDependencies);

    const issues = await deeplyNestedPromptsRule.callback!("project-a");

    expect(promptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project-a" } }),
    );
    expect(dependencyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project-a" } }),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        ctaLink: "/project/project-a/prompts/root",
      }),
    ]);
    expect(issues[0].description).toContain("root");
  });
});
