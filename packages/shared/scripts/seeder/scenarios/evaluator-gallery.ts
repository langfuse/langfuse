import { z } from "zod";
import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import {
  chunk,
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";

const EvaluatorListResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  meta: z.object({ cursor: z.string().optional() }),
});

type EvaluatorSummary = z.infer<typeof EvaluatorListResponse>["data"][number];

const apiHeaders = {
  Authorization: `Basic ${Buffer.from(
    `${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`,
  ).toString("base64")}`,
  "Content-Type": "application/json",
};

const request = async (
  ctx: ScenarioContext,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    ...init,
    headers: { ...apiHeaders, ...init?.headers },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new SeedError(
      `Evaluator API ${init?.method ?? "GET"} ${path} returned ${response.status}: ${detail}`,
      "target a seeded local or preview environment with the default synthetic API key",
    );
  }
  return response;
};

const listEvaluators = async (
  ctx: ScenarioContext,
): Promise<EvaluatorSummary[]> => {
  const evaluators: EvaluatorSummary[] = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await request(
      ctx,
      `/api/public/v2/evaluators?${query.toString()}`,
    );
    const page = EvaluatorListResponse.parse(await response.json());
    evaluators.push(...page.data);
    cursor = page.meta.cursor;
  } while (cursor);

  return evaluators;
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const count = params.count as number;
  if (count < 1 || count > 1_000) {
    throw new SeedError(
      `--count must be between 1 and 1000, got ${count}`,
      "pass a count such as --count 200",
    );
  }

  const namePrefix = `${ctx.idPrefix}-custom-evaluator-`;
  const expectedNames = Array.from(
    { length: count },
    (_, index) => `${namePrefix}${String(index + 1).padStart(4, "0")}`,
  );
  const galleryLink = `${ctx.baseUrl}/project/${ctx.projectId}/evals?gallery=open`;

  if (ctx.dryRun) {
    return {
      scenario: "evaluator-gallery",
      target: "api",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: [],
      counts: { evaluators: count, created: count, deleted: 0 },
      verified: {},
      links: [galleryLink],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const expectedNameSet = new Set(expectedNames);
  const existing = await listEvaluators(ctx);
  const retainedNames = new Set<string>();
  const toDelete = existing.filter((evaluator) => {
    if (!evaluator.name.startsWith(namePrefix)) return false;
    if (
      !expectedNameSet.has(evaluator.name) ||
      retainedNames.has(evaluator.name)
    ) {
      return true;
    }
    retainedNames.add(evaluator.name);
    return false;
  });
  const toCreate = expectedNames.filter((name) => !retainedNames.has(name));

  ctx.log(
    `reconciling ${count} custom evaluators via ${ctx.baseUrl}: create ${toCreate.length}, delete ${toDelete.length}`,
  );
  for (const batch of chunk(toDelete, 10)) {
    await Promise.all(
      batch.map((evaluator) =>
        request(
          ctx,
          `/api/public/v2/evaluators/${encodeURIComponent(evaluator.id)}`,
          { method: "DELETE" },
        ),
      ),
    );
  }
  for (const batch of chunk(toCreate, 10)) {
    await Promise.all(
      batch.map((name) =>
        request(ctx, "/api/public/v2/evaluators", {
          method: "POST",
          body: JSON.stringify({
            name,
            description: `Synthetic evaluator for gallery pagination: ${name}`,
            type: "code",
            sourceCode:
              "function evaluate() { return { scores: [{ name: 'seed-score', value: 1 }] }; }",
            sourceCodeLanguage: "TYPESCRIPT",
          }),
        }),
      ),
    );
  }

  const readback = await listEvaluators(ctx);
  const verifiedCount = readback.filter((evaluator) =>
    expectedNameSet.has(evaluator.name),
  ).length;
  if (verifiedCount !== count) {
    throw new SeedError(
      `Readback mismatch: expected ${count} custom evaluators, found ${verifiedCount}`,
    );
  }

  return {
    scenario: "evaluator-gallery",
    target: "api",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts: {
      evaluators: count,
      created: toCreate.length,
      deleted: toDelete.length,
    },
    verified: { evaluators: verifiedCount },
    links: [galleryLink],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const evaluatorGalleryScenario: ScenarioDefinition = {
  name: "evaluator-gallery",
  description:
    "Many project-owned code evaluators for testing the evaluator gallery and its infinite scrolling. Reconciles deterministic names through the public evaluator API, so it can target seeded local and PR preview environments.",
  supportsV4: false,
  target: "api",
  flags: [
    {
      flag: "count",
      type: "number",
      default: 200,
      description: "number of project-owned evaluators to keep",
    },
  ],
  run,
};
