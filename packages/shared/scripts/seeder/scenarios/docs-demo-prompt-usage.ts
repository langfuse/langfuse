import { prisma } from "../../../src/db";
import {
  clickhouseClient,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  createScoresCh,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, traceLink } from "./verify";

// ---------------------------------------------------------------------------
// Production usage of the docs-demo prompt catalogue (seeded by
// `docs-demo-prompts`): traces whose generations link to prompt versions, with
// latency, usage, cost and trace scores, so a prompt's Linked Generations and
// Metrics tabs are populated and a generation can be opened in the playground.
//
// Rows are placed relative to the current minute so they stay inside the
// tables' default "last 24 hours" window; every run first deletes the rows it
// owns (by trace id), so re-runs replace instead of duplicating.
// ---------------------------------------------------------------------------

const MINUTE = 60_000;

/** gpt-4.1-mini / gpt-4.1 list prices per token. */
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.0000004, output: 0.0000016 },
  "gpt-4.1": { input: 0.000002, output: 0.000008 },
};

type Usage = {
  promptName: string;
  version: number;
  traceName: string;
  generationName: string;
  model: string;
  /** chat messages sent to the model */
  input: { role: string; content: string }[];
  output: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** minutes before the anchor */
  agoMin: number;
  userId: string;
  scores: Record<string, number>;
};

const CRITIC_RUNS: {
  level: string;
  movie: string;
  review: string;
  rating: string;
}[] = [
  {
    level: "magazine",
    movie: "Ratatouille",
    review:
      "Yes, I adore Ratatouille: its Paris is gorgeous, its kitchen chaos is choreographed like a heist, and Remy's ambition makes the whole film taste of possibility.",
    rating: "9/10",
  },
  {
    level: "expert",
    movie: "Dune: Part Two",
    review:
      "I do: Villeneuve stages desert warfare with operatic scale, and the sound design alone makes every sandworm ride feel seismic.",
    rating: "9/10",
  },
  {
    level: "casual",
    movie: "The Grand Budapest Hotel",
    review:
      "Absolutely, it's a pastel-colored caper that is funny, quick and surprisingly sad by the end.",
    rating: "8/10",
  },
  {
    level: "newspaper",
    movie: "Inception",
    review:
      "Mostly yes: the dream-heist premise is thrilling, even if the exposition sometimes outweighs the emotion.",
    rating: "8/10",
  },
  {
    level: "film-school",
    movie: "Parasite",
    review:
      "Without reservation: Bong Joon-ho turns a house into an argument about class, and every staircase carries meaning.",
    rating: "10/10",
  },
  {
    level: "tv",
    movie: "Barbie",
    review:
      "I do, it's a bright, self-aware comedy that hides a sincere story about growing up under its pink surface.",
    rating: "7/10",
  },
  {
    level: "expert",
    movie: "Oppenheimer",
    review:
      "Yes: Nolan builds a dense, restless portrait of a man and a moment, anchored by Cillian Murphy's haunted stillness.",
    rating: "9/10",
  },
  {
    level: "magazine",
    movie: "Everything Everywhere All at Once",
    review:
      "Yes, it's maximalist and messy on purpose, and beneath the multiverse gags beats a tender family drama.",
    rating: "9/10",
  },
  {
    level: "casual",
    movie: "Top Gun: Maverick",
    review:
      "Totally, the flying scenes are real, loud and thrilling, and the nostalgia never gets in the way.",
    rating: "8/10",
  },
  {
    level: "newspaper",
    movie: "La La Land",
    review:
      "Largely yes: the musical numbers soar and the bittersweet ending earns its sigh, though the middle drifts.",
    rating: "8/10",
  },
  {
    level: "film-school",
    movie: "Spirited Away",
    review:
      "Of course: Miyazaki's bathhouse is a complete world, and Chihiro's quiet courage is the film's real magic.",
    rating: "10/10",
  },
  {
    level: "tv",
    movie: "The Martian",
    review:
      "Yes, it's a survival story that runs on jokes and problem-solving, and Matt Damon is great company.",
    rating: "8/10",
  },
];

const MOVIE_CRITIC_TEMPLATES: Record<number, string> = {
  1: "As a {{criticlevel}} movie critic, do you like {{movie}}?",
  2: "As a {{criticlevel}} movie critic, do you like {{movie}}? Answer in one short paragraph.",
  3: "As a {{criticlevel}} movie critic, do you like {{movie}}? Answer in one short paragraph and end with a rating out of 10.",
};

const compileCritic = (version: number, level: string, movie: string) =>
  MOVIE_CRITIC_TEMPLATES[version]
    .replace("{{criticlevel}}", level)
    .replace("{{movie}}", movie);

/** Older versions answer at length; v3 is short and rated. */
const CRITIC_PROFILES: Record<
  number,
  { latencyMs: number; outputTokens: number; hallucination: number }
> = {
  1: { latencyMs: 2900, outputTokens: 92, hallucination: 0.18 },
  2: { latencyMs: 1700, outputTokens: 44, hallucination: 0.09 },
  3: { latencyMs: 1500, outputTokens: 50, hallucination: 0.03 },
};

const criticUsages = (): Usage[] => {
  const plan = [
    { version: 1, runs: [0, 1, 2, 3], startMin: 21 * 60 },
    { version: 2, runs: [4, 5, 6, 7, 8, 9], startMin: 15 * 60 },
    { version: 3, runs: [0, 10, 11, 1, 4, 6, 7, 2, 9, 3], startMin: 8 * 60 },
  ];
  return plan.flatMap(({ version, runs, startMin }) =>
    runs.map((runIndex, i) => {
      const run = CRITIC_RUNS[runIndex];
      const profile = CRITIC_PROFILES[version];
      const output = {
        1: `${run.review} It's the kind of film I keep recommending, and every rewatch reveals another detail in the craft, the performances and the score that I had missed before.`,
        2: run.review,
        3: `${run.review} Rating: ${run.rating}.`,
      }[version];
      const seed = version * 100 + i;
      return {
        promptName: "movie-critic",
        version,
        traceName: "movie-review",
        generationName: "critic-answer",
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: compileCritic(version, run.level, run.movie),
          },
        ],
        output: output ?? run.review,
        latencyMs: profile.latencyMs + jitter(seed, 1, 600),
        inputTokens: 14 + version * 6 + jitter(seed, 2, 4),
        outputTokens: profile.outputTokens + jitter(seed, 3, 14),
        agoMin: startMin - i * 47 - jitter(seed, 4, 20),
        userId: `user-${1040 + ((runIndex * 7) % 23)}`,
        scores: {
          hallucination: profile.hallucination + jitter(seed, 5, 6) / 100,
          toxicity: jitter(seed, 6, 2) / 100,
        },
      };
    }),
  );
};

const QA_QUESTIONS: { context: string; question: string; answer: string }[] = [
  {
    context:
      "Refunds: annual plans can be refunded in full within 30 days of purchase. After 30 days, unused months are credited to the account.",
    question:
      "Can I still get my money back? I bought the annual plan 3 weeks ago.",
    answer:
      "Yes. Annual plans are fully refundable within 30 days of purchase, so you're still eligible. I can start the refund for you now.",
  },
  {
    context:
      "Seats: workspace owners can add or remove seats under Settings > Billing. Changes are prorated on the next invoice.",
    question: "How do I add two more people to our workspace?",
    answer:
      "Go to Settings > Billing and increase your seat count by two. The extra seats are prorated on your next invoice.",
  },
  {
    context:
      "Data export: admins can export all tickets as CSV from Settings > Data. Exports are emailed within 15 minutes.",
    question: "Is there a way to download all our tickets?",
    answer:
      "Yes. An admin can export every ticket as CSV under Settings > Data; the file arrives by email within about 15 minutes.",
  },
  {
    context:
      "SSO: SAML single sign-on is available on the Enterprise plan. Okta, Azure AD and Google Workspace are supported.",
    question: "Do you support Okta login on the Team plan?",
    answer:
      "SAML SSO, including Okta, is part of the Enterprise plan, so it isn't available on Team. I can connect you with our sales team to discuss upgrading.",
  },
  {
    context:
      "Shipping: orders ship within 2 business days. Tracking links are sent by email once the parcel leaves the warehouse.",
    question: "Where is my order? I haven't received a tracking number.",
    answer:
      "Orders ship within 2 business days and the tracking link is emailed when the parcel leaves the warehouse. If it has been longer than that, I can connect you with an agent to check your order.",
  },
];

/** Later versions get faster, cheaper and more accurate. */
const qaUsages = (): Usage[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((version) => {
    const count =
      version < 6
        ? 2
        : (({ 9: 6, 11: 3, 12: 3 } as Record<number, number>)[version] ?? 4);
    return Array.from({ length: count }, (_, i) => {
      const q = QA_QUESTIONS[(version + i) % QA_QUESTIONS.length];
      const seed = 1000 + version * 10 + i;
      const model = version === 10 ? "gpt-4.1" : "gpt-4.1-mini";
      return {
        promptName: "qa-answer-with-context-chat",
        version,
        traceName: "qa-answer",
        generationName: "answer-with-context",
        model,
        input: [
          {
            role: "system",
            content:
              "You answer customer questions using only the help-center context provided. If the context does not contain the answer, say so and offer to connect the customer with a human agent.",
          },
          {
            role: "user",
            content: `Help-center context:\n${q.context}\n\nCustomer question: ${q.question}`,
          },
        ],
        output: q.answer,
        latencyMs:
          2600 -
          (version - 6) * 170 +
          (version === 10 ? 900 : 0) +
          jitter(seed, 1, 500),
        inputTokens: 180 + (version - 6) * 12 + jitter(seed, 2, 30),
        outputTokens: 60 - (version - 6) * 3 + jitter(seed, 3, 18),
        agoMin: (12 - version) * 110 + 30 + i * 29 + jitter(seed, 4, 15),
        userId: `user-${2200 + ((version * 5 + i * 3) % 31)}`,
        scores: {
          // Peaks near 0.95 / 0.92 for the latest versions.
          accuracy: 0.55 + version * 0.03 + jitter(seed, 5, 6) / 100,
          helpfulness: 0.58 + version * 0.025 + jitter(seed, 6, 6) / 100,
        },
      };
    });
  });

/** Random-looking but stable hex, so ids read like SDK-generated ones. */
const hex8 = (index: number, salt: number) =>
  jitter(0x5eed + salt, index, 0xffffffff)
    .toString(16)
    .padStart(8, "0");

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  if (!/^[0-9a-f]{16}$/.test(ctx.idPrefix)) {
    throw new SeedError(
      `--id-prefix must be 16 hex characters (trace ids are shown in the UI), got "${ctx.idPrefix}"`,
      "pnpm run seed -- docs-demo-prompt-usage --project docs-demo --id-prefix 7c3e9a1f5b2d4e60",
    );
  }
  const usages = [...criticUsages(), ...qaUsages()];
  const anchor = Math.floor(Date.now() / MINUTE) * MINUTE;

  const promptNames = [...new Set(usages.map((u) => u.promptName))];
  const prompts = await prisma.prompt.findMany({
    where: { projectId: ctx.projectId, name: { in: promptNames } },
    select: { id: true, name: true, version: true },
  });
  const promptId = new Map(
    prompts.map((p) => [`${p.name}@${p.version}`, p.id]),
  );
  const missing = [
    ...new Set(
      usages
        .map((u) => `${u.promptName}@${u.version}`)
        .filter((key) => !promptId.has(key)),
    ),
  ];
  if (missing.length > 0) {
    throw new SeedError(
      `Prompt versions not found in project ${ctx.projectId}: ${missing.join(", ")}`,
      `pnpm run seed -- docs-demo-prompts --project ${ctx.projectId}`,
    );
  }

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];

  usages.forEach((u, index) => {
    const traceId = `${ctx.idPrefix}${hex8(index, 1)}${hex8(index, 2)}`;
    const obsId = `${hex8(index, 3)}${hex8(index, 4)}`;
    const start = anchor - u.agoMin * MINUTE;
    const end = start + u.latencyMs + 40;
    const price = PRICES[u.model];
    const cost = {
      input: u.inputTokens * price.input,
      output: u.outputTokens * price.output,
    };
    const inputJson = JSON.stringify(u.input);
    const outputJson = JSON.stringify({ role: "assistant", content: u.output });
    const trace = createTrace({
      id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      session_id: null,
      timestamp: start,
      name: u.traceName,
      user_id: u.userId,
      tags: [],
      public: false,
      bookmarked: false,
      metadata: {},
      input: inputJson,
      output: outputJson,
      created_at: start,
      updated_at: end,
      event_ts: end,
    });
    traces.push(trace);
    observations.push(
      createObservation({
        id: obsId,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type: "GENERATION",
        parent_observation_id: null,
        name: u.generationName,
        start_time: start + 20,
        end_time: end - 20,
        completion_start_time: start + 20 + Math.round(u.latencyMs * 0.3),
        level: "DEFAULT",
        status_message: null,
        input: inputJson,
        output: outputJson,
        provided_model_name: u.model,
        internal_model_id: null,
        provided_usage_details: {
          input: u.inputTokens,
          output: u.outputTokens,
          total: u.inputTokens + u.outputTokens,
        },
        usage_details: {
          input: u.inputTokens,
          output: u.outputTokens,
          total: u.inputTokens + u.outputTokens,
        },
        provided_cost_details: {},
        cost_details: { ...cost, total: cost.input + cost.output },
        total_cost: cost.input + cost.output,
        model_parameters: JSON.stringify({
          temperature: u.promptName === "movie-critic" ? 0.7 : 0.2,
        }),
        prompt_id: promptId.get(`${u.promptName}@${u.version}`) ?? null,
        prompt_name: u.promptName,
        prompt_version: u.version,
        created_at: start,
        updated_at: end,
        event_ts: end,
      }),
    );
    for (const [name, value] of Object.entries(u.scores)) {
      scores.push(
        createTraceScore({
          id: `${traceId}-${name}`,
          project_id: ctx.projectId,
          trace_id: traceId,
          environment: ctx.environment,
          name,
          value: Math.round(value * 100) / 100,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp: end + 30_000,
        }),
      );
    }
  });

  const traceById = new Map(traces.map((t) => [t.id, t]));
  const events = [
    ...traces.map(traceToEvent),
    ...observations.map((o) =>
      observationToEvent(o, traceById.get(o.trace_id ?? "")!),
    ),
  ];
  const traceIds = traces.map((t) => t.id);
  /** The most recent trace of a prompt, e.g. for a generation deep link. */
  const latestTraceLink = (promptName: string) => {
    const index = usages.reduce(
      (best, u, i) =>
        u.promptName === promptName &&
        (best < 0 || u.agoMin < usages[best].agoMin)
          ? i
          : best,
      -1,
    );
    return traceLink(
      ctx,
      traceIds[index],
      anchor - usages[index].agoMin * MINUTE,
    );
  };
  // links[0]: latest movie-critic trace; then the prompt pages; last: latest
  // qa-answer-with-context-chat trace.
  const links = [
    latestTraceLink("movie-critic"),
    ...promptNames.map(
      (name) =>
        `${ctx.baseUrl}/project/${ctx.projectId}/prompts/${encodeURIComponent(name)}`,
    ),
    latestTraceLink("qa-answer-with-context-chat"),
  ];
  const counts = {
    traces: traces.length,
    observations: observations.length,
    events: events.length,
    scores: scores.length,
  };

  if (!ctx.dryRun) {
    for (const table of [
      "events_full",
      "events_core",
      "scores",
      "observations",
    ]) {
      await clickhouseClient().command({
        query: `DELETE FROM ${table} WHERE project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
        query_params: { projectId: ctx.projectId, traceIds },
        clickhouse_settings: { wait_end_of_query: 1 },
      });
    }
    await clickhouseClient().command({
      query: `DELETE FROM traces WHERE project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
      query_params: { projectId: ctx.projectId, traceIds },
      clickhouse_settings: { wait_end_of_query: 1 },
    });

    ctx.log(
      `writing ${traces.length} traces, ${observations.length} generations, ${events.length} events, ${scores.length} scores`,
    );
    await createTracesCh(traces);
    await createObservationsCh(observations);
    for (const batch of chunk(events, 500)) {
      await createEventsCh(batch);
    }
    await createScoresCh(scores);
  }

  const where = `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`;
  const qp = { projectId: ctx.projectId, traceIds };
  const verified: Record<string, number> = ctx.dryRun
    ? {}
    : {
        traces: await countRows(
          "traces",
          `project_id = {projectId: String} AND id IN {traceIds: Array(String)}`,
          qp,
          "uniqExact(id)",
        ),
        observations: await countRows(
          "observations",
          where,
          qp,
          "uniqExact(id)",
        ),
        events: await countRows("events_full", where, qp, "uniqExact(span_id)"),
        scores: await countRows("scores", where, qp, "uniqExact(id)"),
      };
  if (!ctx.dryRun) {
    for (const [key, expected] of Object.entries(counts)) {
      if ((verified[key] ?? 0) < expected) {
        throw new SeedError(
          `Readback mismatch: expected ${expected} ${key}, found ${verified[key] ?? 0}`,
        );
      }
    }
  }

  return {
    scenario: "docs-demo-prompt-usage",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [],
    counts,
    verified,
    links,
    dryRun: ctx.dryRun,
    durationMs: Date.now() - startedAt,
  };
};

export const docsDemoPromptUsageScenario: ScenarioDefinition = {
  name: "docs-demo-prompt-usage",
  description:
    "Production usage of the docs-demo prompt catalogue (run docs-demo-prompts first): movie-critic v1-v3 and qa-answer-with-context-chat v6-v12 generations with latency, usage, cost and trace scores (hallucination/toxicity, accuracy/helpfulness) in the last 24 hours, so Linked Generations and Metrics tabs are populated. v3 + v4 rows; re-runs replace. Needs a 16-hex --id-prefix.",
  supportsV4: true,
  flags: [],
  run,
};
