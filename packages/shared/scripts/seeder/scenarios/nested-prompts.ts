import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import {
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";

// Mirrors MAX_PROMPT_NESTING_DEPTH: the root sits at level 0 and the API
// rejects level 5, so four nested levels is the deepest composable graph.
const MAX_DEPTH = 4;
const DEPENDENCY_TAG = "@@@langfusePrompt:";

type ChatMessage = { role: string; content: string };

type SeedPrompt =
  | { name: string; type: "text"; prompt: string }
  | { name: string; type: "chat"; prompt: ChatMessage[] };

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
  allowNotFound = false,
): Promise<Response | null> => {
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    ...init,
    headers: { ...apiHeaders, ...init?.headers },
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new SeedError(
      `Prompt API ${init?.method ?? "GET"} ${path} returned ${response.status}: ${detail}`,
      "target a running, seeded local or preview environment with the default synthetic API key",
    );
  }
  return response;
};

const promptPath = (name: string, query: Record<string, string>) =>
  `/api/public/v2/prompts/${encodeURIComponent(name)}?${new URLSearchParams(query).toString()}`;

const ref = (name: string) =>
  `${DEPENDENCY_TAG}name=${name}|label=production@@@`;

const refVersion = (name: string, version: number) =>
  `${DEPENDENCY_TAG}name=${name}|version=${version}@@@`;

/**
 * A support-agent chat prompt composed from reusable text snippets. The
 * `persona` branch is a linear chain `depth` levels deep; the `escalation`
 * branch is two levels deep and pins its leaf by version. Returned leaves
 * first, so every dependency exists before its parent is created.
 */
const buildPrompts = (folder: string, depth: number) => {
  const name = (slug: string) => `${folder}/${slug}`;
  const deepestMarker = `[nested-prompts:${folder}:level-${depth}]`;

  const chainLayers = [
    {
      slug: "persona",
      text: "You are Aurora, the support assistant for Northwind Outfitters. You help customers with orders, returns, and product questions.",
    },
    {
      slug: "brand-voice",
      text: "Write like a knowledgeable friend: warm, concise, and concrete. Prefer short paragraphs and plain words over jargon.",
    },
    {
      slug: "tone-guidelines",
      text: "Match the customer's energy. Acknowledge frustration once, then move to a solution. Never blame the customer.",
    },
    {
      slug: "compliance-footer",
      text: "Do not promise delivery dates, refunds, or discounts that the order system has not confirmed. Never ask for full card numbers.",
    },
  ].slice(0, depth);

  const chain: SeedPrompt[] = [];
  for (let level = chainLayers.length; level >= 1; level--) {
    const layer = chainLayers[level - 1];
    const next = chainLayers[level];
    const body = [layer.text];
    if (level === depth) body.push(deepestMarker);
    if (next) body.push(ref(name(next.slug)));
    chain.push({
      name: name(layer.slug),
      type: "text",
      prompt: body.join("\n\n"),
    });
  }

  const refundRules: SeedPrompt = {
    name: name("refund-rules"),
    type: "text",
    prompt:
      "Refunds: unused items within 30 days get a full refund to the original payment method. Used or late items get store credit. Final-sale items are not refundable.",
  };
  const escalationPolicy: SeedPrompt = {
    name: name("escalation-policy"),
    type: "text",
    prompt: [
      "Escalate to a human agent when the customer asks for one, mentions legal action, or the order value exceeds {{escalation_threshold}}.",
      refVersion(refundRules.name, 1),
    ].join("\n\n"),
  };

  const root: SeedPrompt = {
    name: name("support-agent"),
    type: "chat",
    prompt: [
      { role: "system", content: ref(name(chainLayers[0].slug)) },
      { role: "system", content: ref(escalationPolicy.name) },
      {
        role: "user",
        content:
          "Customer {{customer_name}} (order {{order_id}}) writes:\n\n{{customer_message}}",
      },
    ],
  };

  return {
    prompts: [...chain, refundRules, escalationPolicy, root],
    root,
    deepestMarker,
  };
};

const sameContent = (existing: unknown, prompt: SeedPrompt): boolean => {
  if (prompt.type === "text") return existing === prompt.prompt;
  if (!Array.isArray(existing) || existing.length !== prompt.prompt.length) {
    return false;
  }
  return prompt.prompt.every((message, index) => {
    const current = existing[index] as Partial<ChatMessage> | undefined;
    return (
      current?.role === message.role && current?.content === message.content
    );
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const depth = params.depth as number;
  if (depth < 1 || depth > MAX_DEPTH) {
    throw new SeedError(
      `--depth must be between 1 and ${MAX_DEPTH}, got ${depth}`,
      `the API rejects prompt graphs deeper than ${MAX_DEPTH} nested levels; pass e.g. --depth ${MAX_DEPTH}`,
    );
  }

  const { prompts, root, deepestMarker } = buildPrompts(ctx.idPrefix, depth);
  const links = [
    `${ctx.baseUrl}/project/${ctx.projectId}/prompts/${encodeURIComponent(root.name)}`,
  ];
  const summary = (
    counts: Record<string, number>,
    verified: Record<string, number>,
  ): SeedSummary => ({
    scenario: "nested-prompts",
    target: "api",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts,
    verified,
    links,
    dryRun: ctx.dryRun,
    durationMs: Date.now() - startedAt,
  });

  if (ctx.dryRun) {
    return summary(
      { prompts: prompts.length, maxDepth: depth, created: prompts.length },
      {},
    );
  }

  ctx.log(
    `reconciling ${prompts.length} prompts (max depth ${depth}) via ${ctx.baseUrl}`,
  );
  let created = 0;
  for (const prompt of prompts) {
    const response = await request(
      ctx,
      promptPath(prompt.name, { label: "production", resolve: "false" }),
      undefined,
      true,
    );
    const existing = response
      ? ((await response.json()) as { type: string; prompt: unknown })
      : null;
    if (
      existing?.type === prompt.type &&
      sameContent(existing.prompt, prompt)
    ) {
      continue;
    }
    await request(ctx, "/api/public/v2/prompts", {
      method: "POST",
      body: JSON.stringify({
        ...prompt,
        labels: ["production"],
        tags: ["seed", "nested-prompts"],
        commitMessage: "nested-prompts seed scenario",
      }),
    });
    created++;
  }

  const resolvedResponse = await request(
    ctx,
    promptPath(root.name, { label: "production" }),
  );
  const resolved = JSON.stringify(
    ((await resolvedResponse!.json()) as { prompt: unknown }).prompt,
  );
  if (resolved.includes(DEPENDENCY_TAG) || !resolved.includes(deepestMarker)) {
    throw new SeedError(
      `Readback mismatch: resolved ${root.name} does not reach level ${depth} (${resolved.slice(0, 300)})`,
    );
  }

  return summary(
    { prompts: prompts.length, maxDepth: depth, created },
    { resolvedDepth: depth },
  );
};

export const nestedPromptsScenario: ScenarioDefinition = {
  name: "nested-prompts",
  description:
    "A composed support-agent chat prompt whose dependency graph nests --depth levels deep (default: the API maximum of 4) plus a version-pinned side branch, all in one prompt folder. Reconciles through the public prompt API, so it can target seeded local and PR preview environments.",
  supportsV4: false,
  target: "api",
  flags: [
    {
      flag: "depth",
      type: "number",
      default: MAX_DEPTH,
      description: `nested prompt levels below the root (1-${MAX_DEPTH})`,
    },
  ],
  run,
};
