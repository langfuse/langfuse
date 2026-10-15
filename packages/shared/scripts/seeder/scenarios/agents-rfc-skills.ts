import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import { SkillVersionSchema } from "../../../src/features/skills/types";
import { SeedError, type ScenarioContext } from "./types";

const MANAGED_SKILLS = [
  ["task-routing", "Route research tasks to the appropriate specialist."],
  ["source-discovery", "Find primary evidence for a research question."],
  [
    "evidence-audit",
    "Check source claims and identify unsupported statements.",
  ],
  ["citation-style", "Format citations with clear source attribution."],
] as const;

const verifySkillResponse = async (response: Response, name: string) => {
  const body: unknown = await response.json().catch(() => null);
  const skill = SkillVersionSchema.pick({
    name: true,
    version: true,
  }).safeParse(body);
  if (!skill.success || skill.data.name !== name) {
    throw new SeedError(
      "The local Skills API returned an unexpected skill; verify the matching web app and seed project",
    );
  }
};

export const seedRfcManagedSkills = async (
  ctx: ScenarioContext,
): Promise<number> => {
  if (ctx.projectId !== "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a") {
    throw new SeedError(
      "--managed-skills uses the default synthetic API key and requires the default seed project",
    );
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  for (const [name, description] of MANAGED_SKILLS) {
    const path = `/api/public/unstable/skills/${encodeURIComponent(name)}`;
    const current = await fetch(`${ctx.baseUrl}${path}`, { headers });
    if (current.ok) {
      await verifySkillResponse(current, name);
      continue;
    }
    if (current.status !== 404)
      throw new SeedError(
        `Managed skill lookup failed (${current.status}); start the matching local web app before using --managed-skills`,
      );
    const result = await fetch(`${ctx.baseUrl}/api/public/unstable/skills`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        files: [
          {
            path: "SKILL.md",
            content: `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${description}\n\nUse only the synthetic evidence in this local RFC demonstration.\n`,
          },
        ],
        commitMessage: "Add synthetic agent RFC skill",
      }),
    });
    if (!result.ok)
      throw new SeedError(
        `Managed skill creation failed (${result.status}); check the local Skills API and seeded project key`,
      );
    await verifySkillResponse(result, name);
  }
  return MANAGED_SKILLS.length;
};
