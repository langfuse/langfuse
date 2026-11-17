import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { SkillVersionSchema } from "../../../src/features/skills/types";
import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import { SeedError, type ScenarioContext } from "./types";

export const AGENTS_MVP_UNRESOLVED_SKILL = "agents-mvp-unregistered";
export const agentsMvpManagedSkillName = (prefix: string) =>
  `agents-mvp-citation-${createHash("sha256").update(prefix).digest("hex").slice(0, 12)}`;
type AgentsMvpSkillReference = {
  id: string;
  name: string;
  version: number;
};

export async function seedAgentsMvpSkills(
  ctx: ScenarioContext,
): Promise<AgentsMvpSkillReference[]> {
  const url = new URL(ctx.baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const preview =
    url.protocol === "https:" &&
    /^pr-\d+\.preview\.langfuse\.com$/.test(url.hostname);
  if (
    (!local && !preview) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new SeedError(
      "Managed fixture skills require a local app or disposable PR preview URL.",
    );
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${url.origin}/api/public${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok && !(response.status === 404 && !init?.method))
      throw new SeedError(
        `Managed fixture Skills API returned ${response.status}.`,
        "start the matching seeded web app and set NEXTAUTH_URL to its URL",
      );
    return response;
  };
  const projects = z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(await (await request("/projects")).json());
  if (!projects.data.some((project) => project.id === ctx.projectId))
    throw new SeedError(
      "The synthetic Skills API key does not belong to --project.",
    );
  const name = agentsMvpManagedSkillName(ctx.idPrefix);
  const path = `/skills/${encodeURIComponent(name)}`;
  const references: AgentsMvpSkillReference[] = [];
  for (const version of [1, 2]) {
    const files = [
      {
        path: "SKILL.md",
        content: `---\nname: ${name}\ndescription: Synthetic citation guidance for the Agents MVP fixture.\n---\n\n${version === 1 ? "Attach a source to every factual assertion." : "Attach a source and check its publication date for every factual assertion."}\n`,
      },
      {
        path: "references/cases.md",
        content: `# Synthetic source examples\n\nFixture revision ${version}. These examples contain no real user data.\n`,
      },
    ];
    const expected = files.map((file) => ({
      ...file,
      sha256Hash: createHash("sha256").update(file.content).digest("base64"),
    }));
    const found = await request(`${path}?version=${version}`);
    let stored = found.ok
      ? SkillVersionSchema.parse(await found.json())
      : undefined;
    if (!stored) {
      const latest = await request(`${path}?label=latest`);
      const last = latest.ok
        ? SkillVersionSchema.parse(await latest.json()).version
        : 0;
      if (last !== version - 1)
        throw new SeedError(
          "The fixture skill namespace has a version gap; use a fresh --id-prefix.",
        );
      stored = SkillVersionSchema.parse(
        await (
          await request("/skills", {
            method: "POST",
            body: JSON.stringify({
              files,
              commitMessage: `Seed synthetic Agents fixture revision ${version}`,
            }),
          })
        ).json(),
      );
    }
    if (
      stored.projectId !== ctx.projectId ||
      stored.name !== name ||
      stored.version !== version ||
      stored.files.length !== expected.length ||
      expected.some(
        (file) =>
          stored.files.find((candidate) => candidate.path === file.path)
            ?.sha256Hash !== file.sha256Hash,
      )
    )
      throw new SeedError(
        "The fixture skill namespace contains different content; use a fresh --id-prefix.",
      );
    references.push({
      id: stored.id,
      name: stored.name,
      version: stored.version,
    });
    if (version === 2 && !stored.labels.includes("production"))
      await request(`${path}/versions/${version}`, {
        method: "PATCH",
        body: JSON.stringify({
          labels: stored.labels
            .filter((label) => label !== "latest")
            .concat("production"),
        }),
      });
    const readback = SkillVersionSchema.parse(
      await (await request(`${path}?version=${version}`)).json(),
    );
    if (readback.id !== stored.id || readback.projectId !== ctx.projectId)
      throw new SeedError("Managed fixture skill readback mismatch.");
  }
  return references;
}
