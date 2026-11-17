import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  createActivityDemoApi,
  seedActivityDemoSkills,
} from "../../../scripts/seeder/scenarios/agents-activity-demo-skills";
import type { SkillVersionResponse } from "../../features/skills/types";

const ctx = {
  projectId: "dedicated-demo",
  environment: "production",
  seed: 42,
  idPrefix: "activity",
  dryRun: false,
  baseUrl: "http://localhost:3017",
  log() {},
};

describe("Activity demo project credentials", () => {
  it("accepts a private project key only after project verification and never follows redirects", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const request = await createActivityDemoApi(ctx, "/private/seed-key.json", {
      readFile: async () =>
        JSON.stringify({
          publicKey: "project-public",
          secretKey: "project-secret",
        }),
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return Response.json({ data: [{ id: ctx.projectId }] });
      },
    });
    await request("/skills", { method: "POST", body: "{}" });
    expect(requests.map((entry) => new URL(entry.url).pathname)).toEqual([
      "/api/public/projects",
      "/api/public/skills",
    ]);
    expect(requests.every((entry) => entry.init?.redirect === "error")).toBe(
      true,
    );
    const headers = new Headers(requests[1]?.init?.headers);
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("project-public:project-secret").toString("base64")}`,
    );
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("fails closed before writes for wrong-project keys, remote targets and malformed credential files without exposing their contents", async () => {
    let requests = 0;
    let reads = 0;
    const dependencies = {
      readFile: async () => {
        reads++;
        return '{"private":"DO-NOT-ECHO"}';
      },
      fetch: async () => {
        requests++;
        return Response.json({
          data: [{ id: "another-project" }],
          secret: "DO-NOT-ECHO",
        });
      },
    };
    await expect(createActivityDemoApi(ctx, "", dependencies)).rejects.toThrow(
      "does not belong",
    );
    expect(requests).toBe(1);
    for (const baseUrl of [
      "https://cloud.langfuse.com",
      "http://pr-19826.preview.langfuse.com",
      "http://user:secret@localhost:3017",
      "http://localhost:3017/path",
    ])
      await expect(
        createActivityDemoApi(
          { ...ctx, baseUrl },
          "private.json",
          dependencies,
        ),
      ).rejects.toThrow("local app or disposable PR preview");
    expect(reads).toBe(0);
    expect(requests).toBe(1);
    await expect(
      createActivityDemoApi(ctx, "private.json", dependencies),
    ).rejects.toThrow(
      /^Cannot read valid seed credentials; expected a private JSON file with publicKey and secretKey\.$/,
    );
    expect(requests).toBe(1);
  });

  it("reuses exact managed versions and refuses to move a later production label backward on rerun", async () => {
    const versions: SkillVersionResponse[] = [];
    let creations = 0;
    let labelsChanged = 0;
    const request = async (path: string, init?: RequestInit) => {
      const url = new URL(path, "http://localhost");
      if (init?.method === "POST") {
        creations++;
        const { files } = JSON.parse(String(init.body)) as {
          files: { path: string; content: string }[];
        };
        const version = versions.length + 1;
        const stored: SkillVersionResponse = {
          id: `catalog-${version}`,
          projectId: ctx.projectId,
          name: "research-proof",
          version,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          createdBy: "synthetic",
          description: "Synthetic evidence guidance",
          frontmatter: {},
          tags: [],
          labels: ["latest"],
          commitMessage: null,
          files: files.map((file, index) => ({
            id: `${version}-${index}`,
            path: file.path,
            blobId: `${version}-${index}`,
            contentType: "text/markdown",
            contentLength: Buffer.byteLength(file.content),
            sha256Hash: createHash("sha256")
              .update(file.content)
              .digest("base64"),
          })),
        };
        versions.push(stored);
        return Response.json(stored);
      }
      const stored = url.searchParams.has("label")
        ? versions.findLast((version) =>
            version.labels.includes(url.searchParams.get("label")!),
          )
        : versions.find(
            (version) =>
              version.version ===
              Number(
                url.searchParams.get("version") ??
                  url.pathname.split("/").at(-1),
              ),
          );
      if (!stored) return new Response(null, { status: 404 });
      if (init?.method === "PATCH") {
        labelsChanged++;
        stored.labels = (
          JSON.parse(String(init.body)) as { labels: string[] }
        ).labels;
      }
      return Response.json(stored);
    };
    const references = await seedActivityDemoSkills(
      request,
      ctx.projectId,
      "research-proof",
    );
    expect(references.map((reference) => reference.id)).toEqual([
      "catalog-1",
      "catalog-2",
    ]);
    expect(
      await seedActivityDemoSkills(request, ctx.projectId, "research-proof"),
    ).toEqual(references);
    expect(creations).toBe(2);
    expect(labelsChanged).toBe(1);
    versions[1]!.labels = [];
    versions.push({
      ...versions[1]!,
      id: "catalog-3",
      version: 3,
      labels: ["production", "latest"],
    });
    await expect(
      seedActivityDemoSkills(request, ctx.projectId, "research-proof"),
    ).rejects.toThrow("production label");
    expect(labelsChanged).toBe(1);
    expect(versions[2]!.labels).toContain("production");
  });
});
