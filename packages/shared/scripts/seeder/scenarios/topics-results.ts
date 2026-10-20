import { createHash } from "node:crypto";
import { prisma } from "../../../src/db";
import {
  ensureDefaultTopicFacets,
  listTopicRules,
  saveTopicRule,
  saveTopicRun,
  writeTopicAssignments,
  writeTopicSummaries,
} from "../../../src/server/topics";
import {
  DEFAULT_TOPIC_FACETS,
  type TopicAssignment,
  type TopicDefinition,
  type TopicSummary,
} from "../../../src/topics";
import { Rng, utcDayStartMs } from "./rng";
import { topicEvaluationExamples } from "./topics-evaluation";
import { ScenarioContext, SeedError } from "./types";
import { countRows } from "./verify";

const EMBEDDING_DIMENSIONS = 64;
const FIXTURE_MODEL = "seed-fixture";

type Example = ReturnType<typeof topicEvaluationExamples>[number];

/** Facts the fixtures derive from an evaluation trace. */
type TraceFacts = {
  index: number;
  theme: number;
  position: number;
  /** 0 timeout, 1 denied, 2 invalid JSON, 3 empty, 4 success */
  failure: number;
  reply: number;
  request: string;
  /** Summary template variant; the first 100 traces use the base wording. */
  variant: number;
};

/** The 100 base requests repeat for larger runs; facts come from the base index. */
function traceFacts(example: Example): TraceFacts {
  const base = example.index % 100;
  const theme = Math.floor(base / 20);
  const position = base % 20;
  return {
    index: example.index,
    theme,
    position,
    failure: position % 5,
    reply: (theme + Math.floor(position / 5)) % 4,
    request: example.io[0],
    variant: Math.floor(example.index / 100),
  };
}

const vary = (trace: TraceFacts, ...options: string[]) =>
  options[trace.variant % options.length]!;
const VERB_SYNONYMS: [RegExp, string][] = [
  [/^Find /, "Locate "],
  [/^Check /, "Verify "],
  [/^Look up /, "Retrieve "],
  [/^Plan /, "Draft "],
  [/^Calculate /, "Compute "],
  [/^Read /, "Review "],
  [/^Schedule /, "Book "],
  [/^Inspect /, "Examine "],
  [/^Open /, "Read "],
  [/^Build /, "Put together "],
  [/^Compare /, "Contrast "],
  [/^Use /, "Apply "],
];
function intentSummary(trace: TraceFacts) {
  const request = trimPeriod(trace.request);
  const synonym = VERB_SYNONYMS.find(([test]) => test.test(request));
  return vary(
    trace,
    request,
    synonym ? request.replace(synonym[0], synonym[1]) : request,
    `Handle a request to ${request.charAt(0).toLowerCase()}${request.slice(1)}`,
  );
}

const THEMES = [
  {
    subject: "subscription invoices and payments",
    lookup: "the invoice lookup",
    deliverable: "the requested billing record",
  },
  {
    subject: "city sightseeing itineraries",
    lookup: "the places and timetable lookup",
    deliverable: "the requested itinerary",
  },
  {
    subject: "API errors in application code",
    lookup: "the log and source lookup",
    deliverable: "the requested diagnosis",
  },
  {
    subject: "spreadsheet and CSV analysis",
    lookup: "the spreadsheet read",
    deliverable: "the requested figures",
  },
  {
    subject: "candidate interview scheduling",
    lookup: "the calendar lookup",
    deliverable: "the requested booking",
  },
] as const;

type TopicSpec = { key: string; name: string; description: string };
type Classification = { topic: string | null; summary: string } | null;
type FacetFixture = {
  name: string;
  topics: TopicSpec[];
  /** null means the facet is not applicable to the trace. */
  classify: (trace: TraceFacts) => Classification;
};

const trimPeriod = (text: string) => text.replace(/\.$/, "");

// Intent: one request per trace; sub-themes carve the five request themes
// into uneven groups, with two unusual requests left as outliers.
const INTENT_POSITIONS: Record<number, Record<string, number[]>> = {
  0: { "bill-dispute": [3, 8, 9, 16], "bill-details": [1, 6, 10, 11, 14, 18] },
  1: { "travel-transit": [3, 6, 15, 18], outlier: [7] },
  2: { "debug-undefined": [0, 3, 7, 9, 10, 12, 14, 15, 18], outlier: [6] },
  3: { "sheet-quality": [3, 5, 7, 11, 15] },
  4: { "interview-rooms": [3, 8, 14, 18] },
};
const INTENT_DEFAULT = [
  "bill-invoices",
  "travel-city",
  "debug-payload",
  "sheet-summarize",
  "interview-schedule",
];
const intent: FacetFixture = {
  name: "Intent",
  topics: [
    {
      key: "bill-invoices",
      name: "Retrieve subscription invoices and receipts",
      description:
        "Find, download or look up subscription invoices, receipts, balances and billing history.",
    },
    {
      key: "bill-dispute",
      name: "Resolve duplicate or disputed subscription charges",
      description:
        "Check double charges, refunds, credit notes and cancellation timing.",
    },
    {
      key: "bill-details",
      name: "Verify tax and company details on invoices",
      description:
        "Confirm tax numbers, purchase orders, addresses and discounts on bills.",
    },
    {
      key: "travel-city",
      name: "Plan a city sightseeing itinerary",
      description:
        "Build walkable day plans around opening hours, weather and rest breaks.",
    },
    {
      key: "travel-transit",
      name: "Plan a day trip around transit timetables",
      description: "Use ferry, train, bus or boat schedules for excursions.",
    },
    {
      key: "debug-undefined",
      name: "Diagnose undefined or null property crashes",
      description:
        "Trace undefined, null or missing nested fields in API handlers.",
    },
    {
      key: "debug-payload",
      name: "Fix webhook and response payload parsing errors",
      description:
        "Resolve KeyError, TypeError and wrong JSON shapes from external payloads.",
    },
    {
      key: "sheet-summarize",
      name: "Summarize spreadsheet totals and comparisons",
      description:
        "Aggregate revenue, expenses, units or rates by group from workbooks.",
    },
    {
      key: "sheet-quality",
      name: "Find data quality problems in exports",
      description:
        "Flag duplicates, blanks, negatives and invalid values in CSV exports.",
    },
    {
      key: "interview-schedule",
      name: "Schedule candidate interviews",
      description:
        "Find shared availability and book interview slots across time zones.",
    },
    {
      key: "interview-rooms",
      name: "Book interview rooms and check invitations",
      description: "Reserve rooms and verify invitation details for panels.",
    },
  ],
  classify: (trace) => {
    const special = Object.entries(INTENT_POSITIONS[trace.theme] ?? {}).find(
      ([, positions]) => positions.includes(trace.position),
    );
    const key = special?.[0] ?? INTENT_DEFAULT[trace.theme]!;
    return {
      topic: key === "outlier" ? null : key,
      summary: intentSummary(trace),
    };
  },
};

// Sentiment: single-turn task requests carry no emotional signal, so Neutral
// dominates and the groups differ only by the phrasing cue. Terse requests
// are too few to form a group and stay outliers.
const SENTIMENT_CUES: { key: string; test: RegExp; cue: string }[] = [
  {
    key: "neutral-change",
    test: /cancel|moved offices|after adding|changed/i,
    cue: "task that follows a cancellation or change",
  },
  {
    key: "neutral-deadline",
    test: /before our|layover|tomorrow|next week|this weekend/i,
    cue: "task with a deadline or travel constraint",
  },
  {
    key: "neutral-reason",
    test: /accounting|finance folder|procurement|hiring team|recruit|team needs/i,
    cue: "task with a stated business reason",
  },
  {
    key: "neutral-material",
    test: /attached|uploaded|supplied|saved|my list|city guide/i,
    cue: "task referencing supplied material",
  },
  {
    key: "neutral-verify",
    test: /^(Check|Confirm|Verify)|whether/,
    cue: "request to check or confirm a fact",
  },
];
const sentiment: FacetFixture = {
  name: "Sentiment",
  topics: [
    {
      key: "neutral-direct",
      name: "Neutral: direct task instruction",
      description:
        "A plain imperative request with no emotional cue toward the assistant.",
    },
    {
      key: "neutral-verify",
      name: "Neutral: request to check or confirm a fact",
      description:
        "The user asks for a verification in a factual, procedural tone.",
    },
    {
      key: "neutral-reason",
      name: "Neutral: task with a stated business reason",
      description:
        "The user explains who needs the result; routine, no emotional signal.",
    },
    {
      key: "neutral-material",
      name: "Neutral: task referencing supplied material",
      description:
        "The user points at attached files or saved lists; factual tone.",
    },
    {
      key: "neutral-deadline",
      name: "Neutral: task with a deadline or travel constraint",
      description:
        "A time constraint is stated matter-of-factly, without urgency or stress.",
    },
    {
      key: "neutral-change",
      name: "Neutral: task following a cancellation or change",
      description:
        "A recent change is reported calmly as context, not as a complaint.",
    },
  ],
  classify: (trace) => {
    const subject = THEMES[trace.theme]!.subject;
    if (trace.request.split(" ").length <= 9)
      return {
        topic: null,
        summary: `Neutral: terse one-line instruction about ${subject}; no emotional signal.`,
      };
    const cue = SENTIMENT_CUES.find((item) => item.test.test(trace.request));
    const label = cue?.cue ?? "direct task instruction";
    return {
      topic: cue?.key ?? "neutral-direct",
      summary: vary(
        trace,
        `Neutral: ${label} about ${subject}; no emotional signal in the user's text.`,
        `Neutral: ${label} about ${subject}, written in a matter-of-fact tone.`,
        `Neutral: the user gave a ${label} about ${subject} with neither praise nor frustration.`,
      ),
    };
  },
};

// Outcome: the tool outcome decides the state; the reply decides whether the
// run ended waiting on the user.
const COMPLETED_OUTCOME = [
  [
    "delivered the annual invoice PDF link",
    "confirmed the duplicate charge refund with its reference",
    "provided the corrected invoice download reference",
    "listed the two unpaid invoices with their due dates",
  ],
  [
    "returned a Sunday museum and gardens itinerary",
    "returned a palace, market and streets day plan",
    "returned a museum, rest and park day plan",
    "returned an old town, lunch and gallery route",
  ],
  [
    "identified the missing customer_id key and a validation fix",
    "identified the missing order.items array and a validation fix",
    "identified the absent customer.address object and a fix",
    "proposed a regression test for a missing customer_id",
  ],
  [
    "reported expense totals per department",
    "reported units sold per product",
    "reported average order value per region",
    "reported the count of overdue payments",
  ],
  [
    "booked the screening interview for Tuesday 10:00",
    "booked the hiring manager follow-up for Wednesday 15:00",
    "booked Room Cedar and sent the panel invitation",
    "booked the final conversation for Thursday 11:30",
  ],
] as const;
const COMPLETED_KEYS = [
  "completed-billing",
  "completed-travel",
  "completed-debug",
  "completed-sheet",
  "completed-interview",
];
const outcome: FacetFixture = {
  name: "Outcome",
  topics: [
    {
      key: "timeout",
      name: "Not completed: lookup timed out",
      description:
        "The context fetch exceeded its deadline and the run ended without a result.",
    },
    {
      key: "denied-input",
      name: "Needs input: read access must be granted",
      description:
        "The connected account lacked permission; the user was asked to grant access or reconnect.",
    },
    {
      key: "denied-stopped",
      name: "Not completed: permission error ended the run",
      description:
        "A 403 from the source stopped the run with no next step for the user.",
    },
    {
      key: "json",
      name: "Not completed: unreadable tool response",
      description:
        "The tool returned HTML instead of JSON and the run ended without a result.",
    },
    {
      key: "empty-input",
      name: "Needs input: verify the source or identifier",
      description:
        "An empty lookup ended with a request to check the selected source or reference.",
    },
    {
      key: "empty-stopped",
      name: "Not completed: empty lookup, no fallback",
      description:
        "The lookup found nothing and the run ended without asking for input.",
    },
    {
      key: "completed-billing",
      name: "Completed: billing record delivered",
      description:
        "The invoice, refund reference or balance list was returned.",
    },
    {
      key: "completed-travel",
      name: "Completed: day itinerary delivered",
      description: "A timed day plan was returned using the saved hours.",
    },
    {
      key: "completed-debug",
      name: "Completed: code fix identified",
      description:
        "The failing property access was located and a validation fix proposed.",
    },
    {
      key: "completed-sheet",
      name: "Completed: spreadsheet figures reported",
      description: "Totals or counts were computed from the workbook.",
    },
    {
      key: "completed-interview",
      name: "Completed: interview booked",
      description:
        "A slot or room was booked and the invitation details confirmed.",
    },
  ],
  classify: (trace) => {
    const { lookup, deliverable } = THEMES[trace.theme]!;
    switch (trace.failure) {
      case 0:
        return {
          topic: "timeout",
          summary: vary(
            trace,
            `Not completed: ${lookup} timed out, so ${deliverable} was not produced${trace.reply === 0 ? "; the user was told to retry later" : ""}.`,
            `Not completed: no result came back from ${lookup} before its deadline, leaving ${deliverable} missing.`,
            `Not completed: the run ended after ${lookup} exceeded its time limit, without ${deliverable}.`,
          ),
        };
      case 1:
        return trace.reply === 0 || trace.reply === 2
          ? {
              topic: "denied-input",
              summary: vary(
                trace,
                `Needs input: asked the user to grant read access after ${lookup} was denied.`,
                `Needs input: waiting for the user to reconnect an account with permission for ${lookup}.`,
              ),
            }
          : {
              topic: "denied-stopped",
              summary: vary(
                trace,
                `Not completed: ${lookup} returned a permission error, so ${deliverable} was not produced.`,
                `Not completed: a 403 from ${lookup} stopped the run before ${deliverable} could be produced.`,
              ),
            };
      case 2:
        return {
          topic: "json",
          summary: vary(
            trace,
            `Not completed: ${lookup} returned an unreadable response, so ${deliverable} was not produced.`,
            `Not completed: ${lookup} answered with HTML instead of JSON and the run ended without ${deliverable}.`,
            `Not completed: the tool payload from ${lookup} could not be decoded, leaving ${deliverable} missing.`,
          ),
        };
      case 3:
        return trace.reply === 2
          ? {
              topic: "empty-stopped",
              summary: vary(
                trace,
                `Not completed: ${lookup} returned no matching records and the run ended without ${deliverable}.`,
                `Not completed: an empty result from ${lookup} ended the run; ${deliverable} was not produced.`,
              ),
            }
          : {
              topic: "empty-input",
              summary: vary(
                trace,
                `Needs input: asked the user to verify the source or identifier after ${lookup} returned no records.`,
                `Needs input: the run paused for a corrected reference because ${lookup} found nothing.`,
                `Needs input: ended by asking which source to search after ${lookup} came back empty.`,
              ),
            };
      default: {
        const step = Math.floor(trace.position / 5);
        // The lone test-plan result does not fit the fix-delivered group.
        const outlier = trace.theme === 2 && step === 3;
        return {
          topic: outlier ? null : COMPLETED_KEYS[trace.theme]!,
          summary: vary(
            trace,
            `Completed: ${COMPLETED_OUTCOME[trace.theme]![step]}.`,
            `Completed: the tool result confirms the run ${COMPLETED_OUTCOME[trace.theme]![step]}.`,
          ),
        };
      }
    }
  },
};

// Issues: successes are not applicable. Failures split by whether the run
// retried nothing and stopped, or handed the fix to the user.
const ISSUE_DEFERRED_REPLIES: Record<number, number[]> = {
  0: [0],
  1: [0, 2],
  2: [3],
  3: [0, 1, 3],
};
const issues: FacetFixture = {
  name: "Issues",
  topics: [
    {
      key: "timeout-stop",
      name: "Stopped after a tool timeout without retrying",
      description:
        "The context lookup timed out once and the run ended without a retry or an alternative source.",
    },
    {
      key: "timeout-defer",
      name: "Deferred a timeout retry to the user",
      description:
        "After one timeout the user was told to try again later instead of the run retrying.",
    },
    {
      key: "denied-stop",
      name: "Gave up on a permission error without a next step",
      description:
        "A 403 ended the run with no statement of which access was missing.",
    },
    {
      key: "denied-defer",
      name: "Pushed the access fix onto the user",
      description:
        "The run asked the user to grant access instead of trying another available source.",
    },
    {
      key: "json-stop",
      name: "Abandoned the task on a malformed response",
      description:
        "An HTML body where JSON was expected ended the run without a retry.",
    },
    {
      key: "json-defer",
      name: "Asked the user to retry after a malformed response",
      description:
        "The run asked for a later retry instead of re-requesting the data itself.",
    },
    {
      key: "empty-stop",
      name: "Treated an empty lookup as final",
      description:
        "No records came back and the run ended without checking the query or source.",
    },
    {
      key: "empty-defer",
      name: "Returned nothing and asked the user to fix the reference",
      description:
        "The empty result was handed back with a request to correct the identifier instead of broadening the search.",
    },
  ],
  classify: (trace) => {
    if (trace.failure === 4) return null;
    const { lookup, deliverable } = THEMES[trace.theme]!;
    const deferred = ISSUE_DEFERRED_REPLIES[trace.failure]!.includes(
      trace.reply,
    );
    const never = `so ${deliverable} was never produced`;
    switch (trace.failure) {
      case 0:
        return deferred
          ? {
              topic: "timeout-defer",
              summary: vary(
                trace,
                `Told the user to retry later after ${lookup} timed out instead of retrying the call, ${never}.`,
                `Handed the retry to the user after a single timeout of ${lookup}, ${never}.`,
              ),
            }
          : {
              topic: "timeout-stop",
              summary: vary(
                trace,
                `Stopped after ${lookup} timed out once, ${never} and no retry was attempted.`,
                `Gave up on the first timeout of ${lookup} without retrying or using another source, ${never}.`,
                `Ended the run as soon as ${lookup} exceeded its deadline, ${never}.`,
              ),
            };
      case 1:
        return deferred
          ? {
              topic: "denied-defer",
              summary: vary(
                trace,
                `Asked the user to grant access after ${lookup} was denied instead of trying another source, ${never}.`,
                `Pushed the permission fix to the user when ${lookup} returned 403, ${never}.`,
              ),
            }
          : {
              topic: "denied-stop",
              summary: vary(
                trace,
                `Ended the run on a permission error from ${lookup} without naming the missing access, so the user has no way forward.`,
                `Reported a generic permission failure from ${lookup} and stopped, leaving the user without a next step.`,
              ),
            };
      case 2:
        return deferred
          ? {
              topic: "json-defer",
              summary: vary(
                trace,
                `Asked the user to retry later after ${lookup} returned an unreadable response instead of re-requesting it.`,
                `Deferred a retry to the user after ${lookup} came back as HTML, instead of calling the tool again.`,
              ),
            }
          : {
              topic: "json-stop",
              summary: vary(
                trace,
                `Gave up when ${lookup} returned HTML instead of JSON, without retrying the request, ${never}.`,
                `Treated one malformed response from ${lookup} as final and stopped, ${never}.`,
                `Stopped at the decode failure of ${lookup} without a retry or fallback, ${never}.`,
              ),
            };
      default:
        if (deferred)
          return {
            topic: "empty-defer",
            summary: vary(
              trace,
              `Returned an empty result from ${lookup} and asked the user to correct the reference instead of broadening the search.`,
              `Passed the empty result of ${lookup} back to the user for a new identifier instead of widening the query.`,
              `Asked for a corrected reference after ${lookup} found nothing, without trying a broader search first.`,
            ),
          };
        // A traceback that "returned no records" reads unlike the other empty lookups.
        return {
          topic: trace.theme === 2 ? null : "empty-stop",
          summary: vary(
            trace,
            `Accepted an empty result from ${lookup} as final without checking the query, ${never}.`,
            `Took the empty result of ${lookup} at face value and stopped, ${never}.`,
          ),
        };
    }
  },
};

const FACETS: FacetFixture[] = [intent, sentiment, outcome, issues];

type FacetPlan = {
  fixture: FacetFixture;
  /** Topics with at least one member, in fixture order. */
  topics: TopicSpec[];
  rows: { trace: TraceFacts; result: Classification }[];
};

/** Pure classification of the evaluation traces; also drives dry-run counts. */
export function planTopicResults(examples: Example[]): FacetPlan[] {
  return FACETS.map((fixture) => {
    const rows = examples.map((example) => {
      const trace = traceFacts(example);
      return { trace, result: fixture.classify(trace) };
    });
    const used = new Set(rows.map((row) => row.result?.topic));
    return {
      fixture,
      topics: fixture.topics.filter((topic) => used.has(topic.key)),
      rows,
    };
  });
}

export function topicResultCounts(plans: FacetPlan[]) {
  return {
    facets: plans.length,
    topicRuns: plans.length,
    topics: plans.reduce((sum, plan) => sum + plan.topics.length, 0),
    topicSummaries: plans.reduce((sum, plan) => sum + plan.rows.length, 0),
    topicAssignments: plans.reduce(
      (sum, plan) => sum + plan.rows.filter((row) => row.result).length,
      0,
    ),
  };
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const normalize = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
};
const cosineDistance = (a: number[], b: number[]) =>
  1 - a.reduce((sum, value, index) => sum + value * b[index]!, 0);
const gaussian = (rng: Rng) =>
  Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
const randomUnit = (rng: Rng) =>
  normalize(Array.from({ length: EMBEDDING_DIMENSIONS }, () => gaussian(rng)));
const round = (value: number, digits: number) => Number(value.toFixed(digits));

type Cluster = { x: number; y: number; sx: number; sy: number; theta: number };

/**
 * Organic 2D layout: centers fill the plane unevenly (best-of-k spacing, some
 * related topics placed next to each other), clusters are elliptical and
 * tilted, larger topics spread wider, outliers land between clusters.
 */
function topicLayout(rng: Rng, topics: { key: string; size: number }[]) {
  const clusters = new Map<string, Cluster>();
  const placed: Cluster[] = [];
  for (const [index, topic] of topics.entries()) {
    let x: number;
    let y: number;
    if (index > 0 && rng.bool(0.3)) {
      // A related topic sits next to an earlier one, sometimes overlapping.
      const neighbour = rng.pick(placed);
      const angle = rng.next() * 2 * Math.PI;
      const gap = 1.1 + rng.next() * 1.2;
      x = neighbour.x + Math.cos(angle) * gap;
      y = neighbour.y + Math.sin(angle) * gap;
    } else {
      let best = { x: 0, y: 0, score: -1 };
      for (let attempt = 0; attempt < 12; attempt++) {
        const cx = (rng.next() - 0.5) * 16;
        const cy = (rng.next() - 0.5) * 12;
        const score = placed.length
          ? Math.min(...placed.map((c) => Math.hypot(c.x - cx, c.y - cy)))
          : rng.next();
        if (score > best.score) best = { x: cx, y: cy, score };
      }
      x = best.x;
      y = best.y;
    }
    const scale = 0.4 + 0.11 * Math.sqrt(topic.size);
    const cluster = {
      x,
      y,
      sx: scale,
      sy: scale * (0.45 + rng.next() * 0.5),
      theta: rng.next() * Math.PI,
    };
    clusters.set(topic.key, cluster);
    placed.push(cluster);
  }
  const point = (c: Cluster, ox: number, oy: number): [number, number] => [
    round(c.x + ox * Math.cos(c.theta) - oy * Math.sin(c.theta), 4),
    round(c.y + ox * Math.sin(c.theta) + oy * Math.cos(c.theta), 4),
  ];
  return {
    member: (key: string) => {
      const c = clusters.get(key)!;
      return point(c, gaussian(rng) * c.sx, gaussian(rng) * c.sy);
    },
    outlier: (): [number, number] => {
      if (placed.length < 2)
        return [
          round((rng.next() - 0.5) * 14, 4),
          round((rng.next() - 0.5) * 10, 4),
        ];
      const a = rng.pick(placed);
      const b = rng.pick(placed.filter((c) => c !== a));
      const t = 0.3 + rng.next() * 0.4;
      return [
        round(a.x + (b.x - a.x) * t + gaussian(rng) * 0.7, 4),
        round(a.y + (b.y - a.y) * t + gaussian(rng) * 0.7, 4),
      ];
    },
  };
}

export async function seedTopicResults(
  ctx: ScenarioContext,
  input: {
    examples: Example[];
    traceIds: string[];
    timestamps: number[];
    traceName: string;
  },
): Promise<{
  counts: Record<string, number>;
  verified: Record<string, number>;
  runIds: string[];
}> {
  const plans = planTopicResults(input.examples);
  const counts = topicResultCounts(plans);
  const runIds = plans.map(
    (plan) => `${ctx.idPrefix}-run-${slug(plan.fixture.name)}`,
  );
  if (runIds.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id)))
    throw new SeedError(
      "--id-prefix must use only letters, digits, - and _ for topic results",
      "pass e.g. --id-prefix topics-results",
    );

  const facets = await ensureDefaultTopicFacets(ctx.projectId);
  const builtIn = new Map(
    facets
      .filter((facet) => facet.isBuiltIn)
      .map((facet) => [facet.name, facet]),
  );
  for (const preset of DEFAULT_TOPIC_FACETS)
    if (!builtIn.has(preset.name))
      throw new SeedError(`Built-in facet ${preset.name} was not created`);
  const rules = await listTopicRules(ctx.projectId);
  if (rules.length > 1)
    throw new SeedError("This project has more than one Topics rule");
  await saveTopicRule({
    id: rules[0]?.id,
    projectId: ctx.projectId,
    name: rules[0]?.name ?? "Topics",
    filter: rules[0]?.filter ?? [],
    facetIds: [
      ...new Set([
        ...(rules[0]?.facetIds ?? []),
        ...[...builtIn.values()].map((facet) => facet.id),
      ]),
    ],
  });

  const timestamps = input.timestamps;
  const completedAt = new Date(utcDayStartMs() + 45 * 60 * 1000).toISOString();
  const timeRange = {
    from: new Date(Math.min(...timestamps)).toISOString(),
    to: new Date(Math.max(...timestamps) + 1).toISOString(),
  };

  const topicVersionIds: string[] = [];
  for (const [facetIndex, plan] of plans.entries()) {
    const facet = builtIn.get(plan.fixture.name)!;
    const version = facet.versions[0]!.version;
    const facetRef = { facetId: facet.id, facetVersion: version };
    const runId = runIds[facetIndex]!;
    const rng = new Rng(ctx.seed + (facetIndex + 1) * 7919);

    const centroids = new Map(
      plan.topics.map((topic) => [topic.key, randomUnit(rng)]),
    );
    const members = new Map<string, number>();
    for (const row of plan.rows)
      if (row.result?.topic)
        members.set(row.result.topic, (members.get(row.result.topic) ?? 0) + 1);
    const layout = topicLayout(
      new Rng(ctx.seed + (facetIndex + 1) * 104729),
      plan.topics.map((topic) => ({
        key: topic.key,
        size: members.get(topic.key) ?? 1,
      })),
    );

    const summaries: TopicSummary[] = [];
    const pending: { topicKey: string | null; assignment: TopicAssignment }[] =
      [];
    const memberDistances = new Map<string, number[]>();
    const representatives = new Map<string, TopicSummary[]>();
    for (const [index, row] of plan.rows.entries()) {
      const traceId = input.traceIds[index]!;
      const unitStartTime = new Date(timestamps[index]!).toISOString();
      const processedAt = new Date(timestamps[index]! + 90_000).toISOString();
      const base = {
        projectId: ctx.projectId,
        ...facetRef,
        traceId,
        sessionId: null,
        environment: ctx.environment,
        traceName: input.traceName,
        unitStartTime,
      };
      if (!row.result) {
        summaries.push({
          ...base,
          triggerType: "manual",
          state: "not_applicable",
          summary: "",
          embedding: [],
          transcriptId: FIXTURE_MODEL,
          transcriptVersion: FIXTURE_MODEL,
          summaryModel: FIXTURE_MODEL,
          embeddingModel: FIXTURE_MODEL,
          providedUsageDetails: {},
          usageDetails: {},
          providedCostDetails: {},
          costDetails: {},
          processedAt,
          metadata: { scenario: "topics", batch: "results" },
        });
        continue;
      }
      const topicKey = row.result.topic;
      const centroid = topicKey ? centroids.get(topicKey)! : null;
      const embedding = centroid
        ? normalize(centroid.map((value) => value + 0.45 * gaussian(rng)))
        : randomUnit(rng);
      const distances = [...centroids.entries()]
        .map(([key, vector]) => ({
          key,
          distance: cosineDistance(embedding, vector),
        }))
        .sort((a, b) => a.distance - b.distance);
      const nearest = topicKey ?? distances[0]!.key;
      const own = distances.find((item) => item.key === nearest)!.distance;
      const runnerUp =
        distances.find((item) => item.key !== nearest)?.distance ?? null;
      const coordinates = topicKey ? layout.member(topicKey) : layout.outlier();
      const summary: TopicSummary = {
        ...base,
        triggerType: "manual",
        state: "complete",
        summary: row.result.summary,
        embedding: embedding.map((value) => round(value, 6)),
        transcriptId: FIXTURE_MODEL,
        transcriptVersion: FIXTURE_MODEL,
        summaryModel: FIXTURE_MODEL,
        embeddingModel: FIXTURE_MODEL,
        providedUsageDetails: {},
        usageDetails: {},
        providedCostDetails: {},
        costDetails: {},
        processedAt,
        metadata: { scenario: "topics", batch: "results" },
      };
      summaries.push(summary);
      if (topicKey) {
        memberDistances.set(topicKey, [
          ...(memberDistances.get(topicKey) ?? []),
          own,
        ]);
        representatives.set(topicKey, [
          ...(representatives.get(topicKey) ?? []),
          summary,
        ]);
      }
      pending.push({
        topicKey,
        assignment: {
          ...base,
          coordinates,
          summaryProcessedAt: processedAt,
          runId,
          topicId: null,
          topicVersionId: null,
          distance: round(own, 6),
          runnerUpDistance: runnerUp === null ? null : round(runnerUp, 6),
          origin: "initial",
          assignedAt: completedAt,
        },
      });
    }

    const definitions = new Map(
      plan.topics.map((topic): [string, TopicDefinition] => {
        const topicId = `${runId}-${topic.key}`;
        const content = {
          name: topic.name,
          description: topic.description,
          centroid: centroids.get(topic.key)!.map((value) => round(value, 6)),
          radius: round(Math.max(...memberDistances.get(topic.key)!) * 1.05, 6),
          representativeSummaries: (representatives.get(topic.key) ?? [])
            .slice(0, 3)
            .map((row) => ({
              facetId: row.facetId,
              facetVersion: row.facetVersion,
              traceId: row.traceId,
              sessionId: null,
            })),
        };
        // Stored versions are immutable; edited fixtures get a new version id.
        const contentHash = createHash("sha256")
          .update(JSON.stringify(content))
          .digest("hex")
          .slice(0, 8);
        return [
          topic.key,
          {
            ...content,
            topicVersionId: `${topicId}-${contentHash}`,
            projectId: ctx.projectId,
            topicId,
            createdByRunId: runId,
            createdAt: completedAt,
            tags: [],
            metadata: {},
          },
        ];
      }),
    );
    const assignments = pending.map(({ topicKey, assignment }) => {
      const definition = topicKey ? definitions.get(topicKey)! : null;
      return {
        ...assignment,
        topicId: definition?.topicId ?? null,
        topicVersionId: definition?.topicVersionId ?? null,
      };
    });

    ctx.log(
      `${plan.fixture.name}: ${plan.topics.length} topics, ${assignments.length} assignments`,
    );
    await writeTopicSummaries(summaries);
    // Re-runs recreate the run under the same id so the map stays published.
    await prisma.topicClusteringRun.deleteMany({
      where: { projectId: ctx.projectId, id: runId },
    });
    const run = await prisma.topicClusteringRun.create({
      data: {
        id: runId,
        projectId: ctx.projectId,
        facetId: facet.id,
        facetVersion: version,
      },
    });
    const publishedAt = new Date().toISOString();
    await saveTopicRun({
      id: run.id,
      projectId: ctx.projectId,
      facetId: facet.id,
      facetVersion: version,
      status: "completed",
      createdAt: publishedAt,
      startedAt: publishedAt,
      finishedAt: publishedAt,
      error: null,
      config: {
        embeddingModel: FIXTURE_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        exploratory: false,
        minimumCount: 3,
        timeRange,
        seed: { scenario: "topics", batch: "results", idPrefix: ctx.idPrefix },
      },
      topics: [...definitions.values()],
    });
    topicVersionIds.push(
      ...[...definitions.values()].map((topic) => topic.topicVersionId),
    );
    await writeTopicAssignments(assignments);
  }

  const facetIds = [...builtIn.values()].map((facet) => facet.id);
  const queryParams = {
    projectId: ctx.projectId,
    facetIds,
    traceIds: input.traceIds,
    runIds,
    topicVersionIds,
  };
  const verified = {
    facets: await prisma.evaluator.count({
      where: { projectId: ctx.projectId, type: "FACET", isBuiltIn: true },
    }),
    topicRuns: await prisma.topicClusteringRun.count({
      where: {
        projectId: ctx.projectId,
        id: { in: runIds },
        status: "completed",
      },
    }),
    topics: await countRows(
      "topics",
      "project_id = {projectId: String} AND id IN {topicVersionIds: Array(String)}",
      queryParams,
      "uniqExact(id)",
    ),
    topicSummaries: await countRows(
      "topic_facet_summaries",
      "project_id = {projectId: String} AND facet_id IN {facetIds: Array(String)} AND trace_id IN {traceIds: Array(String)}",
      queryParams,
      "uniqExact(facet_id, trace_id)",
    ),
    topicAssignments: await countRows(
      "topic_assignments",
      "project_id = {projectId: String} AND clustering_run_id IN {runIds: Array(String)} AND trace_id IN {traceIds: Array(String)}",
      queryParams,
      "uniqExact(facet_id, trace_id)",
    ),
  };
  return { counts, verified, runIds };
}
