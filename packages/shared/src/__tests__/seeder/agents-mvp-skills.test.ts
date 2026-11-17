import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentsMvpManagedSkillName,
  seedAgentsMvpSkills,
} from "../../../scripts/seeder/scenarios/agents-mvp-skills";
import { type SkillVersionResponse } from "../../features/skills/types";

const context = {
  projectId: "fixture-project",
  environment: "production",
  seed: 42,
  idPrefix: "agents-mvp-fixture",
  dryRun: false,
  baseUrl: "http://localhost:3017",
  log() {},
};

function skillsApi(projectId = context.projectId) {
  const versions: SkillVersionResponse[] = [];
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/projects"))
        return Response.json({ data: [{ id: projectId }] });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          files: { path: string; content: string }[];
        };
        const version = versions.length + 1;
        const record: SkillVersionResponse = {
          id: `skill-${version}`,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          projectId,
          createdBy: "synthetic",
          name: agentsMvpManagedSkillName(context.idPrefix),
          description: "Synthetic citation guidance",
          frontmatter: {},
          version,
          tags: [],
          labels: ["latest"],
          commitMessage: null,
          files: body.files.map((file, index) => ({
            id: `${version}-${index}`,
            path: file.path,
            blobId: `${version}-${index}`,
            sha256Hash: createHash("sha256")
              .update(file.content)
              .digest("base64"),
            contentType: "text/markdown",
            contentLength: Buffer.byteLength(file.content),
          })),
        };
        versions.push(record);
        return Response.json(record);
      }
      const version = Number(
        url.searchParams.get("version") ?? url.pathname.split("/").at(-1),
      );
      const stored =
        versions.find((candidate) => candidate.version === version) ??
        (url.searchParams.get("label") === "latest"
          ? versions.at(-1)
          : undefined);
      if (!stored) return new Response(null, { status: 404 });
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { labels: string[] };
        stored.labels = body.labels;
      }
      return Response.json(stored);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { versions, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("Agents MVP managed Skills API setup", () => {
  it("creates two real versions, validates content hashes and reuses their exact IDs on rerun", async () => {
    const { versions, fetchMock } = skillsApi();
    const first = await seedAgentsMvpSkills(context);
    expect(first).toEqual(
      [1, 2].map((version) => ({
        id: `skill-${version}`,
        name: agentsMvpManagedSkillName(context.idPrefix),
        version,
      })),
    );
    expect(
      versions.map((version) => version.files.map((file) => file.path)),
    ).toEqual([
      ["SKILL.md", "references/cases.md"],
      ["SKILL.md", "references/cases.md"],
    ]);
    expect(versions[1]!.labels).toContain("production");
    expect(await seedAgentsMvpSkills(context)).toEqual(first);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.redirect === "error"),
    ).toBe(true);
  });

  it("refuses a namespace content collision rather than overwriting the existing skill", async () => {
    const { versions, fetchMock } = skillsApi();
    await seedAgentsMvpSkills(context);
    versions[0]!.files[0]!.sha256Hash = "different-content";
    await expect(seedAgentsMvpSkills(context)).rejects.toThrow(
      "different content",
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2);
  });

  it("checks the API key's project before creating any catalog versions", async () => {
    const { versions, fetchMock } = skillsApi("another-project");
    await expect(seedAgentsMvpSkills(context)).rejects.toThrow(
      "does not belong",
    );
    expect(versions).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects remote and credential-bearing destinations before sending the synthetic key", async () => {
    const { fetchMock } = skillsApi();
    for (const baseUrl of [
      "https://cloud.langfuse.com",
      "http://pr-19826.preview.langfuse.com",
      "http://user:password@localhost:3017",
    ]) {
      await expect(
        seedAgentsMvpSkills({ ...context, baseUrl }),
      ).rejects.toThrow("local app or disposable PR preview");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
