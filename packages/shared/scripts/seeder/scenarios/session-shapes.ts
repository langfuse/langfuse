import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createSessionScore,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  EventRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import {
  ensureSeedMediaUploaded,
  linkSeedMediaToObservation,
  type SeedMediaFixture,
} from "../seed-media";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { jitter, Rng, utcDayStartMs } from "./rng";
import {
  chunk,
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import { countRows, sessionLink } from "./verify";

/**
 * Diverse v4 session shapes for the session-detail view (LFE-10520).
 *
 * The v4 session view renders one card per trace. Pre-LFE-10520 it defaulted to
 * a "First Generation in Trace" preset that surfaced only the first
 * `type=GENERATION` observation per trace — which broke agentic sessions whose
 * I/O lives on AGENT/TOOL observations with no GENERATION at all (every card
 * rendered "No observations match the current filter."). The default is now
 * "All observations with I/O", which renders those correctly. This scenario
 * seeds the shapes to see both the fix and the shapes it targets:
 *
 *  - chat   one GENERATION per turn carrying accumulating ChatML messages;
 *           renders as a chat.
 *  - agent  a coding/agent session: I/O on the root AGENT + TOOL children,
 *           NO GENERATION — the shape the old default rendered empty.
 *  - mixed  alternating chat/agent turns.
 *  - media  messages carrying `@@@langfuseMedia:…@@@` references (LFE-14815):
 *           an inline image, several references in one message, and a
 *           link-only payload the chat renderer cannot inline. Uploads its
 *           assets and links them to the observation.
 *
 * Each shape is written as its own session (id `<prefix>-<shape>`) so a single
 * `--shape all` run hands back one session link per shape.
 */

type Shape = "chat" | "agent" | "mixed" | "media";

const SHAPES: readonly Shape[] = ["chat", "agent", "mixed", "media"];

const CHAT_TURNS: ReadonlyArray<{ user: string; assistant: string }> = [
  {
    user: "Hi! How do I get a refund for order #4821? It arrived damaged.",
    assistant:
      "I'm sorry to hear that. I can start a refund for order #4821 right away — refunds for damaged items are processed within 5 business days to your original payment method. Would you like a replacement shipped instead?",
  },
  {
    user: "A refund is fine. Do I need to send the damaged item back?",
    assistant:
      "No need to return it for a damaged-on-arrival item. I've issued the refund and emailed you the confirmation. Is there anything else I can help with?",
  },
  {
    user: "Can you also update the shipping address on my account?",
    assistant:
      "Of course. I've opened the address form — please share the new street, city, and postal code and I'll update it on your profile.",
  },
  {
    user: "It's 14 Rue de la Paix, Paris, 75002.",
    assistant:
      "Done — your default shipping address is now 14 Rue de la Paix, Paris, 75002. Future orders will ship there unless you choose otherwise.",
  },
];

const CODING_TASKS: ReadonlyArray<{
  request: string;
  read: { path: string; content: string };
  patch: { diff: string; result: string };
  test: { command: string; result: string };
  summary: string;
}> = [
  {
    request:
      "The test `validateToken` in src/auth.test.ts is failing after the latest refactor. Find the bug, fix it, and make sure the auth tests pass.",
    read: {
      path: "src/auth.ts",
      content:
        "export function validateToken(token) {\n  const payload = decode(token);\n  return payload.exp > Date.now() / 1000;\n}",
    },
    patch: {
      diff: "@@ -1,4 +1,5 @@\n export function validateToken(token) {\n   const payload = decode(token);\n-  return payload.exp > Date.now() / 1000;\n+  if (!payload) return false;\n+  return payload.exp > Date.now() / 1000;\n }",
      result: "Patch applied to src/auth.ts (1 hunk, +2 -1).",
    },
    test: {
      command: "pnpm vitest run src/auth.test.ts",
      result:
        "✓ src/auth.test.ts (14 tests) 312ms\n  ✓ validateToken rejects a null payload\n\nTest Files  1 passed (1)\n     Tests  14 passed (14)",
    },
    summary:
      "Fixed a missing null-check in validateToken(): a malformed token made decode() return null and threw on `.exp`. Added an early `return false`. All 14 auth tests pass and lint is clean.",
  },
  {
    request:
      "Add a `--dry-run` flag to the export script in scripts/export.ts so it prints the plan without writing files.",
    read: {
      path: "scripts/export.ts",
      content:
        "async function main() {\n  const rows = await load();\n  await writeFiles(rows);\n}",
    },
    patch: {
      diff: "@@ -1,4 +1,7 @@\n async function main() {\n+  const dryRun = process.argv.includes('--dry-run');\n   const rows = await load();\n-  await writeFiles(rows);\n+  if (dryRun) { console.log(`would write ${rows.length} files`); return; }\n+  await writeFiles(rows);\n }",
      result: "Patch applied to scripts/export.ts (1 hunk, +3 -1).",
    },
    test: {
      command: "pnpm tsx scripts/export.ts --dry-run",
      result: "would write 128 files",
    },
    summary:
      "Added a `--dry-run` flag: when present, the export script logs the file count it would write and exits before touching disk. Verified it prints the plan and writes nothing.",
  },
];

const buildChatMessages = (turnIdx: number): string => {
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content:
        "You are a friendly customer-support assistant for an e-commerce store. Be concise and helpful.",
    },
  ];
  for (let i = 0; i <= turnIdx; i++) {
    const turn = CHAT_TURNS[i % CHAT_TURNS.length];
    messages.push({ role: "user", content: turn.user });
    if (i < turnIdx) {
      messages.push({ role: "assistant", content: turn.assistant });
    }
  }
  return JSON.stringify({ messages });
};

/**
 * The media-bearing message shapes behind LFE-14815 / LFE-13602 / LFE-9577:
 *
 *  0 inline-image  one `image_url` part holding a `@@@langfuseMedia:…@@@`
 *                  reference — the customer's shape; the image must render
 *                  inline, and NOT also in the "Media" strip (deduped).
 *  1 multi-ref     two references in one message (image + audio).
 *  2 linked-only   a non-ChatML payload the chat renderer cannot inline, with
 *                  the media linked to the observation — the "Media" strip is
 *                  the only surface, so it proves session/trace-detail parity.
 *  3 bare-refs     content is an ARRAY of bare reference strings, with no
 *                  `{type, …}` wrapper at all (LFE-9577).
 *  4 collapsed-prompt  a system prompt long enough to collapse by default that
 *                  also carries an image part. Collapsing hides long TEXT, so
 *                  the attachment must still render — the strip dedupes it as
 *                  "rendered inline", so a collapsed render that skipped it
 *                  would hide the asset in both places.
 */
type MediaVariant =
  | "inline-image"
  | "multi-ref"
  | "linked-only"
  | "bare-refs"
  | "collapsed-prompt";

const MEDIA_VARIANTS: readonly MediaVariant[] = [
  "inline-image",
  "multi-ref",
  "linked-only",
  "bare-refs",
  "collapsed-prompt",
];

/** Comfortably past the ~250-char / 4-line default collapse threshold. */
const LONG_SYSTEM_PROMPT = [
  "You are an HVAC troubleshooting assistant for residential air-conditioning systems.",
  "Always inspect any attached media before answering, and describe what you actually see.",
  "Prefer the cheapest safe diagnostic first: condensate drain, then coil, then blower, then wiring.",
  "Never instruct the homeowner to open an electrical panel; escalate to a technician instead.",
  "Close every answer with one concrete next step the homeowner can take today.",
].join("\n");

type MediaFixtures = Record<"image" | "audio" | "pdf", SeedMediaFixture>;

const MEDIA_PROMPTS: Record<MediaVariant, { user: string; assistant: string }> =
  {
    "inline-image": {
      user: "My AC has rust in it. I've attached an image of the air handler — what am I looking at?",
      assistant:
        "That rust is most likely from moisture sitting in the air handler — usually a condensate drain problem rather than the thermostat wiring. Want me to walk you through the quick checks?",
    },
    "multi-ref": {
      user: "Here's a photo of the unit and a recording of the noise it makes on startup.",
      assistant:
        "Thanks — the photo shows surface rust below the coil, and the startup noise is consistent with a failing blower bearing. I'd book a technician for the blower.",
    },
    "linked-only": {
      user: "Filing the attachment against the work order.",
      assistant: "Attachment stored against work order #4821.",
    },
    "bare-refs": {
      user: "Attaching the unit photo and the inspection report.",
      assistant:
        "Received both. The report confirms the drain pan was replaced last year, so the rust is recent — I'd check the condensate line first.",
    },
    "collapsed-prompt": {
      user: "Photo of the coil as requested.",
      assistant:
        "Thanks — the coil looks iced at the inlet, which points at low airflow rather than a refrigerant leak. Next step: replace the filter and run the fan for an hour.",
    },
  };

const microPrice = (tokens: number, rate: number) => tokens * rate;

/**
 * Builds the rows for one chat trace: a root AGENT turn (no I/O) plus a
 * GENERATION carrying the accumulating ChatML conversation. The default
 * "first generation" preset surfaces the GENERATION, so the card renders as a
 * chat.
 */
const buildChatTrace = (
  ctx: ScenarioContext,
  rng: Rng,
  sessionId: string,
  traceId: string,
  turnIdx: number,
  timestamp: number,
): {
  trace: TraceRecordInsertType;
  observations: ObservationRecordInsertType[];
} => {
  const turn = CHAT_TURNS[turnIdx % CHAT_TURNS.length];
  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: sessionId,
    timestamp,
    name: "chat-turn",
    user_id: `user-${ctx.idPrefix}`,
    release: "v2.0.0",
    version: "v2.0.0",
    tags: ["seed", "session-shapes", "chat"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "session-shapes",
      shape: "chat",
      turn: String(turnIdx),
    },
    input: turn.user,
    output: turn.assistant,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const rootStart = timestamp + jitter(ctx.seed, turnIdx * 7, 60);
  const genStart = rootStart + 40 + jitter(ctx.seed, turnIdx * 7 + 1, 80);
  const genEnd = genStart + rng.int(700, 2600);
  const usageInput = rng.int(200, 1800);
  const usageOutput = rng.int(60, 500);

  const observations: ObservationRecordInsertType[] = [
    createObservation({
      id: `${traceId}-o0`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "AGENT",
      parent_observation_id: null,
      name: "assistant-turn",
      start_time: rootStart,
      end_time: genEnd + 20,
      completion_start_time: null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: null,
      output: null,
      metadata: { scenario: "session-shapes", shape: "chat" },
      provided_model_name: null,
      internal_model_id: null,
      model_parameters: "{}",
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      total_cost: null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }),
    createObservation({
      id: `${traceId}-o1`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "GENERATION",
      parent_observation_id: `${traceId}-o0`,
      name: "gpt-5.4-completion",
      start_time: genStart,
      end_time: genEnd,
      completion_start_time: genStart + rng.int(90, 320),
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: buildChatMessages(turnIdx),
      output: turn.assistant,
      metadata: { scenario: "session-shapes", shape: "chat" },
      provided_model_name: "gpt-5.4",
      internal_model_id: null,
      model_parameters: JSON.stringify({ temperature: 0.4 }),
      provided_usage_details: {
        input: usageInput,
        output: usageOutput,
        total: usageInput + usageOutput,
      },
      usage_details: {
        input: usageInput,
        output: usageOutput,
        total: usageInput + usageOutput,
      },
      provided_cost_details: {
        input: microPrice(usageInput, 2e-6),
        output: microPrice(usageOutput, 6e-6),
      },
      cost_details: {
        input: microPrice(usageInput, 2e-6),
        output: microPrice(usageOutput, 6e-6),
        total: microPrice(usageInput, 2e-6) + microPrice(usageOutput, 6e-6),
      },
      total_cost: microPrice(usageInput, 2e-6) + microPrice(usageOutput, 6e-6),
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }),
  ];

  return { trace, observations };
};

/**
 * Builds the rows for one coding/agent trace: a root AGENT carrying the user's
 * request and the agent's final answer, plus TOOL children with real I/O and
 * an empty SPAN. There is NO GENERATION, so the default "first generation"
 * preset selects nothing and the card renders empty — the LFE-10520 bug.
 */
const buildAgentTrace = (
  ctx: ScenarioContext,
  rng: Rng,
  sessionId: string,
  traceId: string,
  turnIdx: number,
  timestamp: number,
): {
  trace: TraceRecordInsertType;
  observations: ObservationRecordInsertType[];
} => {
  const task = CODING_TASKS[turnIdx % CODING_TASKS.length];
  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: sessionId,
    timestamp,
    name: "coding-agent",
    user_id: `user-${ctx.idPrefix}`,
    release: "v2.0.0",
    version: "v2.0.0",
    tags: ["seed", "session-shapes", "agent"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "session-shapes",
      shape: "agent",
      turn: String(turnIdx),
    },
    input: task.request,
    output: task.summary,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const base = timestamp + jitter(ctx.seed, turnIdx * 13, 60);
  const mkTime = (slot: number) =>
    base + slot * 400 + jitter(ctx.seed, turnIdx * 13 + slot + 1, 120);

  const observations: ObservationRecordInsertType[] = [];

  const mkChild = (
    slot: number,
    id: string,
    type: "TOOL" | "SPAN",
    name: string,
    input: string | null,
    output: string | null,
  ) => {
    const start = mkTime(slot);
    observations.push(
      createObservation({
        id,
        trace_id: traceId,
        project_id: ctx.projectId,
        environment: ctx.environment,
        type,
        parent_observation_id: `${traceId}-o0`,
        name,
        start_time: start,
        end_time: start + rng.int(20, 400),
        completion_start_time: null,
        level: "DEFAULT",
        status_message: null,
        version: null,
        input,
        output,
        metadata: { scenario: "session-shapes", shape: "agent" },
        provided_model_name: null,
        internal_model_id: null,
        model_parameters: "{}",
        provided_usage_details: {},
        usage_details: {},
        provided_cost_details: {},
        cost_details: {},
        total_cost: null,
        prompt_id: null,
        prompt_name: null,
        prompt_version: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      }),
    );
  };

  // Root AGENT carries the request + final answer (generation-like I/O, but
  // NOT a GENERATION type — this is exactly what the default preset misses).
  const rootStart = base;
  observations.push(
    createObservation({
      id: `${traceId}-o0`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "AGENT",
      parent_observation_id: null,
      name: "coding-agent",
      start_time: rootStart,
      end_time: mkTime(5) + 50,
      completion_start_time: null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: task.request,
      output: task.summary,
      metadata: { scenario: "session-shapes", shape: "agent" },
      provided_model_name: null,
      internal_model_id: null,
      model_parameters: "{}",
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      total_cost: null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }),
  );

  mkChild(1, `${traceId}-o1`, "SPAN", "plan", null, null);
  mkChild(
    2,
    `${traceId}-o2`,
    "TOOL",
    "read_file",
    JSON.stringify({ path: task.read.path }),
    task.read.content,
  );
  mkChild(
    3,
    `${traceId}-o3`,
    "TOOL",
    "apply_patch",
    JSON.stringify({ path: task.read.path, diff: task.patch.diff }),
    task.patch.result,
  );
  mkChild(
    4,
    `${traceId}-o4`,
    "TOOL",
    "run_tests",
    JSON.stringify({ command: task.test.command }),
    task.test.result,
  );

  return { trace, observations };
};

/**
 * Builds one media-bearing trace: a root AGENT plus a GENERATION whose input
 * carries a Langfuse media reference. Also reports the observation/field pairs
 * to link in `observation_media` so the "Media" strip resolves.
 */
const buildMediaTrace = (
  ctx: ScenarioContext,
  rng: Rng,
  sessionId: string,
  traceId: string,
  turnIdx: number,
  timestamp: number,
  fixtures: MediaFixtures,
): {
  trace: TraceRecordInsertType;
  observations: ObservationRecordInsertType[];
  mediaLinks: { observationId: string; mediaId: string }[];
} => {
  const variant = MEDIA_VARIANTS[turnIdx % MEDIA_VARIANTS.length];
  const prompt = MEDIA_PROMPTS[variant];
  const genId = `${traceId}-o1`;

  const imagePart = {
    type: "image_url",
    image_url: { url: fixtures.image.referenceString },
  };

  const userContent =
    variant === "bare-refs"
      ? [fixtures.image.referenceString, fixtures.pdf.referenceString]
      : variant === "collapsed-prompt"
        ? prompt.user
        : variant === "inline-image"
          ? [{ type: "text", text: prompt.user }, imagePart]
          : [
              { type: "text", text: prompt.user },
              imagePart,
              {
                type: "input_audio",
                input_audio: { data: fixtures.audio.referenceString },
              },
            ];

  // collapsed-prompt hangs the attachment off the long SYSTEM message, which is
  // the message the UI collapses by default.
  const systemContent =
    variant === "collapsed-prompt"
      ? [{ type: "text", text: LONG_SYSTEM_PROMPT }, imagePart]
      : "You are an HVAC troubleshooting assistant. Inspect attached media before answering.";

  // linked-only stays deliberately non-ChatML: the chat renderer cannot inline
  // it, so only the media strip can surface the asset.
  const genInput =
    variant === "linked-only"
      ? JSON.stringify({
          work_order: "4821",
          note: prompt.user,
          attachment: {
            mediaId: fixtures.image.mediaId,
            contentType: fixtures.image.contentType,
            referenceString: fixtures.image.referenceString,
          },
        })
      : JSON.stringify({
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        });

  const mediaLinks = [
    { observationId: genId, mediaId: fixtures.image.mediaId },
  ];
  if (variant === "multi-ref") {
    mediaLinks.push({ observationId: genId, mediaId: fixtures.audio.mediaId });
  }
  if (variant === "bare-refs") {
    mediaLinks.push({ observationId: genId, mediaId: fixtures.pdf.mediaId });
  }

  const trace = createTrace({
    id: traceId,
    project_id: ctx.projectId,
    environment: ctx.environment,
    session_id: sessionId,
    timestamp,
    name: "hvac-troubleshooting-agent",
    user_id: `user-${ctx.idPrefix}`,
    release: "v2.0.0",
    version: "v2.0.0",
    tags: ["seed", "session-shapes", "media"],
    public: false,
    bookmarked: false,
    metadata: {
      scenario: "session-shapes",
      shape: "media",
      variant,
      turn: String(turnIdx),
    },
    input: prompt.user,
    output: prompt.assistant,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
  });

  const rootStart = timestamp + jitter(ctx.seed, turnIdx * 17, 60);
  const genStart = rootStart + 40 + jitter(ctx.seed, turnIdx * 17 + 1, 80);
  const genEnd = genStart + rng.int(900, 3200);
  const usageInput = rng.int(400, 2200);
  const usageOutput = rng.int(80, 600);
  const inputCost = microPrice(usageInput, 2e-6);
  const outputCost = microPrice(usageOutput, 6e-6);

  const observations: ObservationRecordInsertType[] = [
    createObservation({
      id: `${traceId}-o0`,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "AGENT",
      parent_observation_id: null,
      name: "troubleshooting-agent",
      start_time: rootStart,
      end_time: genEnd + 20,
      completion_start_time: null,
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: null,
      output: null,
      metadata: { scenario: "session-shapes", shape: "media", variant },
      provided_model_name: null,
      internal_model_id: null,
      model_parameters: "{}",
      provided_usage_details: {},
      usage_details: {},
      provided_cost_details: {},
      cost_details: {},
      total_cost: null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }),
    createObservation({
      id: genId,
      trace_id: traceId,
      project_id: ctx.projectId,
      environment: ctx.environment,
      type: "GENERATION",
      parent_observation_id: `${traceId}-o0`,
      name: "gpt-5.4-vision-completion",
      start_time: genStart,
      end_time: genEnd,
      completion_start_time: genStart + rng.int(90, 320),
      level: "DEFAULT",
      status_message: null,
      version: null,
      input: genInput,
      output: prompt.assistant,
      metadata: { scenario: "session-shapes", shape: "media", variant },
      provided_model_name: "gpt-5.4",
      internal_model_id: null,
      model_parameters: JSON.stringify({ temperature: 0.2 }),
      provided_usage_details: {
        input: usageInput,
        output: usageOutput,
        total: usageInput + usageOutput,
      },
      usage_details: {
        input: usageInput,
        output: usageOutput,
        total: usageInput + usageOutput,
      },
      provided_cost_details: { input: inputCost, output: outputCost },
      cost_details: {
        input: inputCost,
        output: outputCost,
        total: inputCost + outputCost,
      },
      total_cost: inputCost + outputCost,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    }),
  ];

  return { trace, observations, mediaLinks };
};

const buildSession = (
  ctx: ScenarioContext,
  rng: Rng,
  shape: Shape,
  turns: number,
  mediaFixtures?: MediaFixtures,
): {
  sessionId: string;
  sessionStart: number;
  traces: TraceRecordInsertType[];
  observations: ObservationRecordInsertType[];
  mediaLinks: { traceId: string; observationId: string; mediaId: string }[];
} => {
  const sessionId = `${ctx.idPrefix}-${shape}`;
  // Anchor each session in a recent, distinct hour so UI time windows show
  // them and the three sessions don't overlap their timestamps.
  const shapeOffsetMin = (SHAPES.indexOf(shape) + 1) * 90;
  const sessionStart = utcDayStartMs() - shapeOffsetMin * 60 * 1000;
  const stepMs = (45 * 60 * 1000) / Math.max(turns, 1);

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const mediaLinks: {
    traceId: string;
    observationId: string;
    mediaId: string;
  }[] = [];

  for (let t = 0; t < turns; t++) {
    const traceId = `${ctx.idPrefix}-${shape}-t${t}`;
    const timestamp =
      sessionStart + Math.floor(t * stepMs) + jitter(ctx.seed, t, 400);

    // mixed alternates chat/agent turns; chat/agent/media are uniform.
    const turnShape: Exclude<Shape, "mixed"> =
      shape === "mixed" ? (t % 2 === 0 ? "chat" : "agent") : shape;

    if (turnShape === "media") {
      if (!mediaFixtures) {
        throw new SeedError(
          "media shape requires seeded media fixtures",
          "this is a bug in the scenario — fixtures are resolved before buildSession",
        );
      }
      const built = buildMediaTrace(
        ctx,
        rng,
        sessionId,
        traceId,
        t,
        timestamp,
        mediaFixtures,
      );
      traces.push(built.trace);
      observations.push(...built.observations);
      mediaLinks.push(
        ...built.mediaLinks.map((link) => ({ ...link, traceId })),
      );
      continue;
    }

    const built =
      turnShape === "chat"
        ? buildChatTrace(ctx, rng, sessionId, traceId, t, timestamp)
        : buildAgentTrace(ctx, rng, sessionId, traceId, t, timestamp);

    traces.push(built.trace);
    observations.push(...built.observations);
  }

  return { sessionId, sessionStart, traces, observations, mediaLinks };
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const shapeParam = String(params["shape"]);
  const turns = params["turns"] as number;
  const withV4 = params["v4"] as boolean;

  if (shapeParam !== "all" && !SHAPES.includes(shapeParam as Shape)) {
    throw new SeedError(
      `--shape must be one of ${SHAPES.join(", ")}, all — got "${shapeParam}"`,
      "e.g. --shape agent (the empty-cards repro) or --shape all",
    );
  }
  if (turns < 1) {
    throw new SeedError(
      `--turns must be >= 1, got ${turns}`,
      "pass a positive integer, e.g. --turns 8",
    );
  }

  let shapesToSeed: Shape[] =
    shapeParam === "all" ? [...SHAPES] : [shapeParam as Shape];

  const rng = new Rng(ctx.seed);

  // Uploaded up front: the reference strings must be embedded in the payloads
  // the builders produce, and a media shape with unresolvable assets would
  // silently look like the bug it exists to disprove. Only the media shape
  // needs storage — the others must still seed without it.
  let mediaFixtures: MediaFixtures | undefined;
  if (shapesToSeed.includes("media") && !ctx.dryRun) {
    const [image, audio, pdf] = await Promise.all([
      ensureSeedMediaUploaded(ctx.projectId, "image"),
      ensureSeedMediaUploaded(ctx.projectId, "audio"),
      ensureSeedMediaUploaded(ctx.projectId, "pdf"),
    ]);

    if (image && audio && pdf) {
      mediaFixtures = { image, audio, pdf };
    } else if (shapeParam === "media") {
      throw new SeedError(
        "could not seed media assets for the media shape",
        "check LANGFUSE_S3_MEDIA_UPLOAD_BUCKET and that MinIO is running (pnpm run seed -- doctor)",
      );
    } else {
      ctx.log(
        "skipping the media shape: media assets could not be uploaded (check LANGFUSE_S3_MEDIA_UPLOAD_BUCKET / MinIO)",
      );
      shapesToSeed = shapesToSeed.filter((shape) => shape !== "media");
    }
  }

  if (ctx.dryRun) {
    return {
      scenario: "session-shapes",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: shapesToSeed.map((shape) => `${ctx.idPrefix}-${shape}-t0`),
      sessionIds: shapesToSeed.map((shape) => `${ctx.idPrefix}-${shape}`),
      counts: {
        sessions: shapesToSeed.length,
        traces: shapesToSeed.length * turns,
      },
      verified: {},
      links: shapesToSeed.map((shape) =>
        sessionLink(ctx, `${ctx.idPrefix}-${shape}`),
      ),
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  const allTraces: TraceRecordInsertType[] = [];
  const allObservations: ObservationRecordInsertType[] = [];
  const allScores: ScoreRecordInsertType[] = [];
  const allEvents: EventRecordInsertType[] = [];
  const sessionIds: string[] = [];
  const links: string[] = [];

  for (const shape of shapesToSeed) {
    const { sessionId, sessionStart, traces, observations, mediaLinks } =
      buildSession(ctx, rng, shape, turns, mediaFixtures);
    for (const link of mediaLinks) {
      await linkSeedMediaToObservation({
        projectId: ctx.projectId,
        traceId: link.traceId,
        observationId: link.observationId,
        mediaId: link.mediaId,
        field: "input",
      });
    }
    sessionIds.push(sessionId);
    links.push(sessionLink(ctx, sessionId));
    allTraces.push(...traces);
    allObservations.push(...observations);

    allScores.push(
      createSessionScore({
        id: `${sessionId}-quality`,
        project_id: ctx.projectId,
        session_id: sessionId,
        environment: ctx.environment,
        name: "session-quality",
        value: Math.round(rng.next() * 100) / 100,
        data_type: "NUMERIC",
        source: "API",
        comment: null,
        metadata: {},
        timestamp: sessionStart,
      }),
    );

    // The session detail page 404s without the Postgres trace_sessions row.
    await prisma.traceSession.upsert({
      where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
      update: {},
      create: {
        id: sessionId,
        projectId: ctx.projectId,
        environment: ctx.environment,
        createdAt: new Date(sessionStart),
      },
    });
  }

  if (withV4) {
    const tracesById = new Map(allTraces.map((tr) => [tr.id, tr]));
    for (const trace of allTraces) {
      allEvents.push(traceToEvent(trace));
    }
    for (const obs of allObservations) {
      const trace = obs.trace_id ? tracesById.get(obs.trace_id) : undefined;
      if (trace) allEvents.push(observationToEvent(obs, trace));
    }
  }

  ctx.log(
    `writing ${sessionIds.length} sessions, ${allTraces.length} traces, ${allObservations.length} observations, ${allScores.length} scores${
      withV4 ? `, ${allEvents.length} events` : ""
    }`,
  );
  for (const batch of chunk(allTraces, 1000)) {
    await createTracesCh(batch);
  }
  for (const batch of chunk(allObservations, 1000)) {
    await createObservationsCh(batch);
  }
  await createScoresCh(allScores);
  for (const batch of chunk(allEvents, 500)) {
    await createEventsCh(batch);
  }

  const traceIds = allTraces.map((tr) => tr.id);
  const verified: Record<string, number> = {
    traces: await countRows(
      "traces",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(id)",
    ),
    observations: await countRows(
      "observations",
      `project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)}`,
      { projectId: ctx.projectId, traceIds },
      "uniqExact(id)",
    ),
  };
  if (withV4) {
    verified.events = await countRows(
      "events_full",
      `project_id = {projectId: String} AND session_id IN {sessionIds: Array(String)}`,
      { projectId: ctx.projectId, sessionIds },
      "uniqExact(span_id)",
    );
  }

  if (verified.traces < allTraces.length) {
    throw new SeedError(
      `Readback mismatch: expected ${allTraces.length} session traces, found ${verified.traces}`,
    );
  }
  if (verified.observations < allObservations.length) {
    throw new SeedError(
      `Readback mismatch: expected ${allObservations.length} observations, found ${verified.observations}`,
    );
  }
  if (withV4 && verified.events < allEvents.length) {
    throw new SeedError(
      `Readback mismatch: expected ${allEvents.length} events_full rows, found ${verified.events}`,
    );
  }

  return {
    scenario: "session-shapes",
    target: "clickhouse",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: traceIds.slice(0, 5),
    sessionIds,
    counts: {
      sessions: sessionIds.length,
      traces: allTraces.length,
      observations: allObservations.length,
      scores: allScores.length,
      events: allEvents.length,
    },
    verified,
    links,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const sessionShapesScenario: ScenarioDefinition = {
  name: "session-shapes",
  description:
    "Diverse v4 session shapes for the session-detail view: a clean multi-turn CHAT session (renders as chat), a coding/AGENT session whose I/O lives on AGENT/TOOL observations with NO GENERATION (the default 'first generation' preset yields empty cards — LFE-10520), a MIXED session, and a MEDIA session whose messages carry @@@langfuseMedia:...@@@ references (inline image, multiple references in one message, and a link-only payload — LFE-14815). Creates the Postgres trace_sessions rows; the media shape uploads its assets to MinIO.",
  supportsV4: true,
  flags: [
    {
      flag: "shape",
      type: "string",
      default: "all",
      description: "session shape: chat | agent | mixed | media | all",
    },
    {
      flag: "turns",
      type: "number",
      default: 8,
      description: "traces (turns) per session",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description:
        "mirror into v4 events tables (on by default: v4-only surface)",
    },
  ],
  run,
};
