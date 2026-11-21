import { createHash } from "node:crypto";
import { createSkillTools, Workspace } from "@mastra/core/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGFUSE_HALO_SKILLS } from "@repo/langfuse-skills";
import { InAppAgentSkillSource } from "./skill-source";

vi.mock("@langfuse/shared/src/server", () => ({
  getProductBaseUrl: () => new URL("https://example.com"),
  logger: { warn: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const config = { tag: "halo", publicKey: "pk-test", secretKey: "sk-test" };
const timestamp = "2026-11-04T00:00:00.000Z";

function hostedVersion(
  version = 3,
  id = "version-id",
  guide = "Nested guide",
  instructions = "Read references/nested/guide.md.",
) {
  const files = [
    {
      path: "SKILL.md",
      content: `---\nname: langfuse\ndescription: Hosted skill\n---\n${instructions}`,
    },
    { path: "references/nested/guide.md", content: guide },
    { path: "scripts/check.py", content: "print('checked')" },
    { path: "assets/template.json", content: '{"ready":true}' },
    { path: "docs/nested/guide.md", content: "Custom directory" },
    { path: "checklist.md", content: "Root checklist" },
  ];
  return {
    id,
    projectId: "ai-project",
    createdBy: "user-id",
    createdAt: timestamp,
    updatedAt: timestamp,
    name: "langfuse",
    description: "Hosted skill",
    frontmatter: { name: "langfuse", description: "Hosted skill" },
    version,
    tags: ["halo"],
    labels: ["production"],
    commitMessage: null,
    files: files.map((file, index) => ({
      ...file,
      id: String(index),
      blobId: String(index),
      sha256Hash: createHash("sha256").update(file.content).digest("base64"),
      contentType: "text/plain",
      contentLength: Buffer.byteLength(file.content),
    })),
  };
}

function mockApi() {
  const state = {
    version: hostedVersion(),
    listed: true,
    fail: false,
    failContent: false,
    missingContent: false,
  };
  const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = new URL(input);
    if (state.fail) return new Response(null, { status: 503 });
    if (url.pathname.endsWith("/files/content")) {
      if (state.failContent) return new Response(null, { status: 503 });
      const hashes = url.searchParams.get("sha256Hashes")!.split(",");
      return Response.json({
        data: state.version.files
          .filter(
            (file) => !state.missingContent && hashes.includes(file.sha256Hash),
          )
          .map(({ sha256Hash, content }) => ({
            sha256Hash,
            content,
          })),
      });
    }
    if (url.pathname.endsWith("/skills")) {
      return Response.json({
        data: state.listed
          ? [
              {
                name: state.version.name,
                description: "Latest description differs",
                tags: ["halo"],
                latestVersion: 8,
                productionVersion: state.version.version,
                latestVersionCreatedAt: timestamp,
                latestVersionLastUpdatedAt: timestamp,
              },
            ]
          : [],
        meta: {
          page: 1,
          limit: 100,
          totalItems: Number(state.listed),
          totalPages: 1,
          hasNextPage: false,
        },
      });
    }
    if (
      !state.listed ||
      !url.pathname.endsWith("/langfuse") ||
      (url.searchParams.has("version") &&
        url.searchParams.get("version") !== String(state.version.version))
    )
      return new Response(null, { status: 404 });
    return Response.json({
      ...state.version,
      files: state.version.files.map(({ content: _content, ...file }) => file),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const contentCalls = () =>
    fetchMock.mock.calls.filter(([url]) =>
      new URL(url).pathname.endsWith("/files/content"),
    );
  return { state, fetchMock, contentCalls };
}

const root = "/skills";
const mainFile = `${root}/langfuse/SKILL.md`;
const guideFile = `${root}/langfuse/references/nested/guide.md`;
const repositoryEntries = LANGFUSE_HALO_SKILLS.map(({ frontmatter }) => ({
  name: frontmatter.name,
  type: "directory",
}));
const repositoryMain = LANGFUSE_HALO_SKILLS.find(
  ({ frontmatter }) => frontmatter.name === "langfuse",
)!.resources.find(({ path }) => path === "SKILL.md")!.text;
const text = (content: string | Buffer) => content.toString();
const discover = (source: InAppAgentSkillSource) =>
  new Workspace({ skillSource: source, skills: [root] }).skills!;

describe("in-app agent skill filesystem", () => {
  it("exposes hosted directories, file stats, and arbitrary nested paths", async () => {
    const { state, fetchMock } = mockApi();
    const source = new InAppAgentSkillSource(config);
    expect(await source.readdir(root)).toEqual(repositoryEntries);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(url).pathname).toBe("/api/public/skills");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("pk-test:sk-test").toString("base64")}`,
    );
    expect(await source.readdir(`${root}/langfuse/references`)).toEqual([
      { name: "nested", type: "directory" },
    ]);
    expect(await source.stat(guideFile)).toMatchObject({
      name: "guide.md",
      type: "file",
      size: Buffer.byteLength("Nested guide"),
      createdAt: expect.any(Date),
      modifiedAt: expect.any(Date),
    });
    for (const file of state.version.files.filter(
      ({ path }) => path !== "SKILL.md",
    )) {
      expect(await source.exists(`${root}/langfuse/${file.path}`)).toBe(true);
      expect(text(await source.readFile(`${root}/langfuse/${file.path}`))).toBe(
        file.content,
      );
    }
    expect(await source.exists(`${root}/unknown/SKILL.md`)).toBe(false);
    await expect(source.readFile(`${root}/unknown/SKILL.md`)).rejects.toThrow();
    await expect(source.stat(`${root}/unknown`)).rejects.toThrow();
    for (const path of [
      "/etc/passwd",
      "/skills/../SKILL.md",
      "/skills/langfuse/references/../../.env",
      "/skills/langfuse/references\\guide.md",
    ]) {
      await expect(source.readFile(path)).rejects.toThrow();
      await expect(source.readdir(path)).rejects.toThrow();
    }
  });

  it("reuses skill manifests and contents across concurrent and sequential file access", async () => {
    const { state, fetchMock, contentCalls } = mockApi();
    const source = new InAppAgentSkillSource(config);
    await source.readdir(root);
    expect(
      (
        await Promise.all([
          source.readFile(guideFile),
          source.readFile(guideFile),
        ])
      ).map(text),
    ).toEqual(["Nested guide", "Nested guide"]);
    expect(contentCalls()).toHaveLength(1);
    await source.exists(mainFile);
    await source.stat(guideFile);
    await source.readdir(`${root}/langfuse/references`);
    await source.readdir(root);
    await source.readFile(guideFile);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        new URL(url).pathname.endsWith("/skills/langfuse"),
      ),
    ).toHaveLength(1);
    state.version = hostedVersion(3, "replacement-id", "Replacement guide");
    expect(await source.readFile(guideFile)).toBe("Nested guide");
    expect(await new InAppAgentSkillSource(config).readFile(guideFile)).toBe(
      "Replacement guide",
    );
    expect(contentCalls()).toHaveLength(2);
  });

  it("exposes repository skills without a configured tag and never fetches", async () => {
    const { fetchMock } = mockApi();
    const source = new InAppAgentSkillSource();
    expect(await source.readdir(root)).toEqual(repositoryEntries);
    expect(await source.exists(mainFile)).toBe(true);
    expect(await source.readFile(mainFile)).toBe(repositoryMain);
    expect(
      (await discover(source).list()).map(({ name }) => name).sort(),
    ).toEqual(repositoryEntries.map(({ name }) => name).sort());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to repository skills for missing, unselected, or failed hosted manifests", async () => {
    const { state } = mockApi();
    state.listed = false;
    const missing = new InAppAgentSkillSource(config);
    expect(await missing.readdir(root)).toEqual(repositoryEntries);
    expect(await missing.exists(mainFile)).toBe(true);
    expect(await missing.readFile(mainFile)).toBe(repositoryMain);
    expect(await missing.exists(`${root}/unknown/SKILL.md`)).toBe(false);
    await expect(
      missing.readFile(`${root}/unknown/SKILL.md`),
    ).rejects.toThrow();

    state.listed = true;
    state.version.tags = [];
    expect(await new InAppAgentSkillSource(config).readFile(mainFile)).toBe(
      repositoryMain,
    );

    state.version.tags = ["halo"];
    state.fail = true;
    const unavailable = new InAppAgentSkillSource(config);
    expect(await unavailable.readdir(root)).toEqual(repositoryEntries);
    expect(await unavailable.readFile(mainFile)).toBe(repositoryMain);
  });

  it("evicts failed and missing downloads so subsequent reads retry", async () => {
    const { state, contentCalls } = mockApi();
    const source = new InAppAgentSkillSource(config);
    state.failContent = true;
    await expect(source.readFile(guideFile)).rejects.toThrow();
    state.failContent = false;
    state.missingContent = true;
    await expect(source.readFile(guideFile)).rejects.toThrow();
    state.missingContent = false;
    expect(text(await source.readFile(guideFile))).toBe("Nested guide");
    expect(contentCalls()).toHaveLength(3);
  });

  it("lets native Mastra discover, activate, read, and search the complete catalogue", async () => {
    mockApi();
    const skills = discover(new InAppAgentSkillSource(config));
    expect(
      (await skills.list()).map(({ name, path }) => ({ name, path })),
    ).toEqual(
      expect.arrayContaining(
        repositoryEntries.map(({ name }) => ({
          name,
          path: `${root}/${name}`,
        })),
      ),
    );
    expect(await skills.get("/skills/langfuse/SKILL.md")).toMatchObject({
      description: "Hosted skill",
      metadata: { langfuseProjectId: "ai-project", langfuseSkillVersion: 3 },
      instructions: "Read references/nested/guide.md.",
      references: ["nested/guide.md"],
      scripts: ["check.py"],
      assets: ["template.json"],
    });
    const { skill_read } = createSkillTools(skills);
    expect(
      await skill_read.execute!(
        { skillName: "langfuse", path: "docs/nested/guide.md" },
        {},
      ),
    ).toBe("Custom directory");
    expect(
      await skills.search("Nested guide", { skillNames: ["langfuse"] }),
    ).toEqual([
      expect.objectContaining({
        skillName: "langfuse",
        source: "references/nested/guide.md",
        content: "Nested guide",
      }),
    ]);
  });

  it("propagates caller cancellation before and during source requests", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Run cancelled"));
    const aborted = new InAppAgentSkillSource({
      ...config,
      signal: controller.signal,
    });
    for (const operation of [
      () => aborted.exists(root),
      () => aborted.stat(root),
      () => aborted.readFile(mainFile),
      () => aborted.readdir(root),
    ])
      await expect(operation()).rejects.toThrow("Run cancelled");
    for (const operation of [
      (source: InAppAgentSkillSource) => source.readdir(root),
      (source: InAppAgentSkillSource) => source.exists(mainFile),
    ]) {
      const active = new AbortController();
      vi.stubGlobal(
        "fetch",
        vi.fn((_input: string | URL, init: RequestInit) => {
          const pending = new Promise<Response>((_resolve, reject) => {
            init.signal!.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
          active.abort(new Error("Run cancelled"));
          return pending;
        }),
      );
      await expect(
        operation(
          new InAppAgentSkillSource({ ...config, signal: active.signal }),
        ),
      ).rejects.toThrow(/abort|cancel/i);
      expect(active.signal.aborted).toBe(true);
    }
  });
});
