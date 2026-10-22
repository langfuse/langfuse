import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { z } from "zod";
import {
  SkillDescriptionSchema,
  SkillNameSchema,
  SkillTagsSchema,
  SkillVersionSchema,
} from "../../../src/features/skills/types";
import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import {
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";

const BundledSkillsSchema = z.object({
  LANGFUSE_SKILLS: z.array(
    z.object({
      name: SkillNameSchema,
      description: SkillDescriptionSchema,
      instructions: z.string().min(1),
    }),
  ),
});

const SkillWithContentSchema = SkillVersionSchema.extend({
  files: z.array(
    SkillVersionSchema.shape.files.element.extend({
      content: z.string().optional(),
    }),
  ),
});

const request = async (
  ctx: ScenarioContext,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(`${ctx.baseUrl}/api/public${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`,
      ).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok && !(response.status === 404 && !init?.method)) {
    throw new SeedError(
      `Skills API ${init?.method ?? "GET"} ${path} returned ${response.status}: ${(await response.text()).slice(0, 500)}`,
      "target a running seeded local or preview environment with the default synthetic API key",
    );
  }
  return response;
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const tag = SkillTagsSchema.parse([params.tag])[0]!;
  // This repository-only fixture does not add a runtime dependency to shared.
  const bundle: unknown = createRequire(__filename)(
    resolve(__dirname, "../../../../langfuse-skills"),
  );
  const definitions = BundledSkillsSchema.parse(bundle).LANGFUSE_SKILLS;
  if (params.demo === true) {
    definitions.push({
      name: "local-assistant-check",
      description:
        "Verify hosted assistant skills. Use when asked to run the local assistant check.",
      instructions: 'Reply with exactly: "Hosted skills are connected."',
    });
  }
  const skills = definitions.map(({ name, description, instructions }) => {
    const content = `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n${instructions}\n`;
    return {
      name,
      files: [
        {
          path: "SKILL.md",
          content,
          sha256Hash: createHash("sha256").update(content).digest("base64"),
        },
      ],
    };
  });
  const links = skills.map(
    ({ name }) => `${ctx.baseUrl}/project/${ctx.projectId}/skills/${name}`,
  );
  const summary: SeedSummary = {
    scenario: "assistant-skills",
    target: "api",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts: { skills: skills.length, created: 0 },
    verified: {},
    links,
    dryRun: ctx.dryRun,
    durationMs: 0,
  };
  if (ctx.dryRun) {
    return { ...summary, durationMs: Date.now() - startedAt };
  }

  const projects = z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(await (await request(ctx, "/projects")).json());
  if (!projects.data.some(({ id }) => id === ctx.projectId)) {
    throw new SeedError(
      "The synthetic API key does not belong to --project",
      "use the default seeded project (or its matching synthetic API key environment)",
    );
  }

  for (const skill of skills) {
    const path = `/skills/${skill.name}`;
    const response = await request(ctx, `${path}?label=latest`);
    let version = response.ok
      ? SkillVersionSchema.parse(await response.json())
      : undefined;
    if (
      version?.files.length !== skill.files.length ||
      skill.files.some(
        (file) =>
          version?.files.find(({ path }) => path === file.path)?.sha256Hash !==
          file.sha256Hash,
      )
    ) {
      version = SkillVersionSchema.parse(
        await (
          await request(ctx, "/skills", {
            method: "POST",
            body: JSON.stringify({
              files: skill.files.map(({ path, content }) => ({
                path,
                content,
              })),
              commitMessage: "Import bundled Langfuse assistant skill",
            }),
          })
        ).json(),
      );
      summary.counts.created++;
    }
    if (!version.tags.includes(tag)) {
      await request(ctx, path, {
        method: "PATCH",
        body: JSON.stringify({ tags: [...version.tags, tag] }),
      });
    }
    if (!version.labels.includes("production")) {
      await request(ctx, `${path}/versions/${version.version}`, {
        method: "PATCH",
        body: JSON.stringify({
          labels: [
            ...version.labels.filter((label) => label !== "latest"),
            "production",
          ],
        }),
      });
    }
    const readback = SkillWithContentSchema.parse(
      await (
        await request(ctx, `${path}?label=production&includeContent=true`)
      ).json(),
    );
    if (
      readback.projectId !== ctx.projectId ||
      readback.version !== version.version ||
      !readback.tags.includes(tag) ||
      readback.files.length !== skill.files.length ||
      skill.files.some(
        (file) =>
          readback.files.find(({ path }) => path === file.path)?.content !==
          file.content,
      )
    ) {
      throw new SeedError(`Readback mismatch for skill ${skill.name}`);
    }
    ctx.log(`${skill.name} v${version.version}: production, tag ${tag}`);
  }

  return {
    ...summary,
    verified: { skills: skills.length },
    durationMs: Date.now() - startedAt,
  };
};

export const assistantSkillsScenario: ScenarioDefinition = {
  name: "assistant-skills",
  description:
    "Import bundled Langfuse assistant skills into skill management through the seeded public API key. Reuses unchanged versions and applies the production label and assistant tag.",
  supportsV4: false,
  target: "api",
  flags: [
    {
      flag: "demo",
      type: "boolean",
      default: false,
      description: "include a local check skill with a fixed response",
    },
    {
      flag: "tag",
      type: "string",
      default: "in-app-agent",
      description: "tag used to select the assistant's managed skills",
    },
  ],
  run,
};
