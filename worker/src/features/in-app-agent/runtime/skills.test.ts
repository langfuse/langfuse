import { afterEach, describe, expect, it, vi } from "vitest";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";

import { LANGFUSE_IN_APP_AGENT_SKILLS, loadInAppAgentSkills } from "./skills";

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: vi.fn() },
  getProductBaseUrl: vi.fn(() => new URL("http://localhost:3000")),
}));

const config = {
  tag: "in-app-agent",
  baseUrl: "http://localhost:3002",
  publicKey: "pk-local",
  secretKey: "sk-local",
};

const manifest = {
  id: "skill-version-id",
  projectId: "local-ai-project",
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
  createdBy: "API",
  name: "local-guide",
  description: "Published description",
  version: 3,
  frontmatter: {},
  tags: [config.tag],
  labels: ["production"],
  commitMessage: null,
  files: [
    {
      id: "instructions",
      path: "SKILL.md",
      blobId: "instructions-blob",
      sha256Hash: "instructions-hash",
      contentType: "text/markdown",
      contentLength: 100,
      content:
        "---\nname: local-guide\ndescription: Published description\n---\nFollow the local guide.",
    },
  ],
};

const listPage = (data: unknown[], hasNextPage = false) => ({
  data,
  meta: {
    page: 1,
    limit: 100,
    totalItems: data.length,
    totalPages: 1,
    hasNextPage,
  },
});

const published = {
  name: manifest.name,
  description: "Unpublished latest description",
  tags: [config.tag],
  latestVersion: 4,
  latestVersionCreatedAt: manifest.createdAt,
  latestVersionLastUpdatedAt: manifest.updatedAt,
  productionVersion: 3,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("in-app agent managed skills", () => {
  it("keeps the bundled catalogue when managed skills are not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect((await loadInAppAgentSkills({})).skills).toBe(
      LANGFUSE_IN_APP_AGENT_SKILLS,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("pages the catalogue and loads instructions from the selected production version", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(listPage([published], true)))
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(
        Response.json(
          listPage([{ ...published, name: "draft", productionVersion: null }]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { skills } = await loadInAppAgentSkills(config);

    expect(skills).toHaveLength(LANGFUSE_IN_APP_AGENT_SKILLS.length + 1);
    for (const bundled of LANGFUSE_IN_APP_AGENT_SKILLS) {
      expect(skills.find(({ name }) => name === bundled.name)).toBe(bundled);
    }
    expect(skills.find(({ name }) => name === manifest.name)).toMatchObject({
      name: manifest.name,
      description: manifest.description,
      instructions: "Follow the local guide.",
      metadata: {
        langfuseSkillId: manifest.id,
        langfuseProjectId: manifest.projectId,
        langfuseSkillVersion: 3,
      },
    });
    const urls = fetchMock.mock.calls.map(([url]) => new URL(url));
    expect(urls[0]?.searchParams.get("tag")).toBe(config.tag);
    expect(urls[1]?.pathname).toBe("/api/public/skills/local-guide");
    expect(urls[1]?.searchParams.get("version")).toBe("3");
    expect(urls[1]?.searchParams.get("includeContent")).toBe("true");
    expect(urls[2]?.searchParams.get("page")).toBe("2");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      headers: {
        Authorization: `Basic ${Buffer.from("pk-local:sk-local").toString("base64")}`,
      },
    });
  });

  it("overrides a bundled skill by name while retaining the other bundled skills", async () => {
    const bundled = LANGFUSE_IN_APP_AGENT_SKILLS[0]!;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(listPage([{ ...published, name: bundled.name }])),
        )
        .mockResolvedValueOnce(
          Response.json({ ...manifest, name: bundled.name }),
        ),
    );

    const { skills } = await loadInAppAgentSkills(config);

    expect(skills).toHaveLength(LANGFUSE_IN_APP_AGENT_SKILLS.length);
    expect(skills.filter(({ name }) => name === bundled.name)).toEqual([
      expect.objectContaining({
        description: manifest.description,
        instructions: "Follow the local guide.",
        metadata: {
          langfuseSkillId: manifest.id,
          langfuseProjectId: manifest.projectId,
          langfuseSkillVersion: manifest.version,
        },
      }),
    ]);
    for (const local of LANGFUSE_IN_APP_AGENT_SKILLS.slice(1)) {
      expect(skills.find(({ name }) => name === local.name)).toBe(local);
    }
  });

  it("keeps bundled skills without warning when the remote catalogue is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(listPage([]))),
    );

    expect((await loadInAppAgentSkills(config)).skills).toEqual(
      LANGFUSE_IN_APP_AGENT_SKILLS,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns and falls back to the complete bundled catalogue when authentication fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    expect(await loadInAppAgentSkills(config)).toEqual({
      skills: LANGFUSE_IN_APP_AGENT_SKILLS,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to load managed assistant skills; using bundled skills",
      { error: expect.stringContaining("HTTP 401") },
    );
  });

  it("warns and falls back when project credentials are missing", async () => {
    expect(await loadInAppAgentSkills({ tag: config.tag })).toEqual({
      skills: LANGFUSE_IN_APP_AGENT_SKILLS,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to load managed assistant skills; using bundled skills",
      { error: expect.stringContaining("credentials") },
    );
  });

  it("discards a partial managed catalogue if a later manifest is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(listPage([published], true)))
        .mockResolvedValueOnce(Response.json(manifest))
        .mockResolvedValueOnce(Response.json(listPage([published])))
        .mockResolvedValueOnce(
          Response.json({
            ...manifest,
            files: manifest.files.map(({ content: _content, ...file }) => file),
          }),
        ),
    );
    expect(await loadInAppAgentSkills(config)).toEqual({
      skills: LANGFUSE_IN_APP_AGENT_SKILLS,
    });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("warns and falls back when fetching the catalogue fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("fetch failed")),
    );
    expect(await loadInAppAgentSkills(config)).toEqual({
      skills: LANGFUSE_IN_APP_AGENT_SKILLS,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to load managed assistant skills; using bundled skills",
      { error: "fetch failed" },
    );
  });

  it("falls back if resolving the default deployment URL fails", async () => {
    vi.mocked(getProductBaseUrl).mockImplementationOnce(() => {
      throw new Error("Deployment URL unavailable");
    });
    expect(
      await loadInAppAgentSkills({ ...config, baseUrl: undefined }),
    ).toEqual({
      skills: LANGFUSE_IN_APP_AGENT_SKILLS,
    });
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
