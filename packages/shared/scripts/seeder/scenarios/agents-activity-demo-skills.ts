import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod/v4";
import { SkillVersionSchema } from "../../../src/features/skills/types";
import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import { SeedError, type ScenarioContext } from "./types";
import {
  activityDemoSkillInstructions,
  type ActivityDemoStory,
} from "./agents-activity-demo-plan";

type SeedRequest = (path: string, init?: RequestInit) => Promise<Response>;
type ActivitySkillReference = {
  id: string;
  name: string;
  version: number;
};

/** Authenticates only a local/preview target and verifies project ownership before any write. */
export async function createActivityDemoApi(
  ctx: ScenarioContext,
  credentialsFile = "",
  dependencies = { fetch, readFile: (path: string) => readFile(path, "utf8") },
): Promise<SeedRequest> {
  let url: URL;
  try {
    url = new URL(ctx.baseUrl);
  } catch {
    throw new SeedError(
      "The activity demo requires a local app or disposable PR preview URL.",
    );
  }
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
      "The activity demo requires a local app or disposable PR preview URL.",
    );
  let credentials: { publicKey: string; secretKey: string } = {
    publicKey: DEFAULT_SEED_API_KEY.public,
    secretKey: DEFAULT_SEED_API_KEY.secret,
  };
  if (credentialsFile) {
    try {
      const result = z
        .object({
          publicKey: z.string().min(1).max(1024),
          secretKey: z.string().min(1).max(1024),
        })
        .strict()
        .safeParse(JSON.parse(await dependencies.readFile(credentialsFile)));
      if (!result.success) throw new Error();
      credentials = result.data;
    } catch {
      throw new SeedError(
        "Cannot read valid seed credentials; expected a private JSON file with publicKey and secretKey.",
      );
    }
  }
  const authorization = `Basic ${Buffer.from(`${credentials.publicKey}:${credentials.secretKey}`).toString("base64")}`;
  const request: SeedRequest = async (path, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", authorization);
    headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await dependencies.fetch(`${url.origin}/api/public${path}`, {
        ...init,
        redirect: "error",
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
        headers,
      });
    } catch {
      throw new SeedError(
        "The activity demo API request failed; check the matching local or preview web app.",
      );
    }
    if (!response.ok && !(response.status === 404 && !init?.method))
      throw new SeedError(
        `The activity demo API returned HTTP ${response.status}.`,
      );
    return response;
  };
  let matchesProject = false;
  try {
    const projects = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .safeParse(await (await request("/projects")).json());
    matchesProject =
      projects.success &&
      projects.data.data.some((project) => project.id === ctx.projectId);
  } catch {
    throw new SeedError(
      "Cannot verify the activity demo API key's project; no fixture data was written.",
    );
  }
  if (!matchesProject)
    throw new SeedError(
      "The activity demo API key does not belong to --project; no fixture data was written.",
    );
  return request;
}

export async function seedActivityDemoSkills(
  request: SeedRequest,
  projectId: string,
  name: string,
  story: ActivityDemoStory = "agentique",
): Promise<ActivitySkillReference[]> {
  const parse = async (response: Response) => {
    try {
      return SkillVersionSchema.parse(await response.json());
    } catch {
      throw new SeedError("The activity demo Skills API response was invalid.");
    }
  };
  const references: ActivitySkillReference[] = [];
  const path = `/skills/${encodeURIComponent(name)}`;
  for (const version of [1, 2]) {
    const files = [
      {
        path: "SKILL.md",
        content: `---\nname: ${name}\ndescription: Synthetic ${story} guidance for the Agents activity demo.\n---\n\n${activityDemoSkillInstructions(story, version)}\n`,
      },
      {
        path: "references/checklist.md",
        content: `# Synthetic ${story} checklist\n\nRevision ${version}: ${activityDemoSkillInstructions(story, version)} These are authored examples, not customer data or executed tools.\n`,
      },
    ];
    const found = await request(`${path}?version=${version}`);
    let stored = found.ok ? await parse(found) : undefined;
    if (!stored) {
      const latest = await request(`${path}?label=latest`);
      const last = latest.ok ? (await parse(latest)).version : 0;
      if (last !== version - 1)
        throw new SeedError(
          "The activity demo skill namespace has a version gap; use a fresh --id-prefix.",
        );
      stored = await parse(
        await request("/skills", {
          method: "POST",
          body: JSON.stringify({
            files,
            commitMessage: `Seed synthetic research evidence revision ${version}`,
          }),
        }),
      );
    }
    if (
      stored.projectId !== projectId ||
      stored.name !== name ||
      stored.version !== version ||
      stored.files.length !== files.length ||
      files.some(
        (file) =>
          stored.files.find((candidate) => candidate.path === file.path)
            ?.sha256Hash !==
          createHash("sha256").update(file.content).digest("base64"),
      )
    )
      throw new SeedError(
        "The activity demo skill namespace contains different content; use a fresh --id-prefix.",
      );
    if (version === 2 && !stored.labels.includes("production")) {
      const production = await request(`${path}?label=production`);
      if (production.ok && (await parse(production)).id !== stored.id)
        throw new SeedError(
          "The activity demo production label belongs to another version; use a fresh --id-prefix.",
        );
      await request(`${path}/versions/2`, {
        method: "PATCH",
        body: JSON.stringify({
          labels: [
            ...stored.labels.filter((label) => label !== "latest"),
            "production",
          ],
        }),
      });
    }
    const readback = await parse(await request(`${path}?version=${version}`));
    if (readback.id !== stored.id || readback.projectId !== projectId)
      throw new SeedError("Activity demo managed skill readback mismatch.");
    references.push({ id: stored.id, name, version });
  }
  return references;
}
