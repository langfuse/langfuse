import { randomBytes, randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "80" },
    observations: { type: "string", default: "10:20" },
  },
});
const count = Number(values.count);
const observationBounds = values.observations.split(":").map(Number);
const minObservations = observationBounds[0];
const maxObservations = observationBounds[1] ?? minObservations;
if (!Number.isInteger(count) || count < 1 || count > 5000) {
  throw new Error("--count must be an integer between 1 and 5000");
}
if (
  !/^\d+(?::\d+)?$/.test(values.observations) ||
  !Number.isInteger(minObservations) ||
  !Number.isInteger(maxObservations) ||
  minObservations < 9 ||
  maxObservations > 1000 ||
  minObservations > maxObservations
) {
  throw new Error(
    "--observations must be a count or min:max range within 9..1000",
  );
}
if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
  throw new Error("Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY");
}

const dependencyDirectory = join(tmpdir(), "tracelift-demo-sdk");
const require = createRequire(join(dependencyDirectory, "package.json"));
try {
  require.resolve("@langfuse/tracing");
  require.resolve("@langfuse/otel");
  require.resolve("@opentelemetry/sdk-trace-node");
} catch {
  execFileSync(
    "npm",
    [
      "install",
      "--prefix",
      dependencyDirectory,
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      "@langfuse/tracing@5",
      "@langfuse/otel@5",
      "@opentelemetry/sdk-trace-node@2",
    ],
    { stdio: "inherit" },
  );
}

const { LangfuseSpanProcessor } = require("@langfuse/otel");
const { startObservation, propagateAttributes } = require("@langfuse/tracing");
const {
  NodeTracerProvider,
  AlwaysOnSampler,
} = require("@opentelemetry/sdk-trace-node");
const baseUrl =
  process.env.LANGFUSE_BASE_URL ??
  process.env.LANGFUSE_HOST ??
  "http://localhost:3000";
const runId = randomBytes(4).toString("hex");
let currentTraceId;
const provider = new NodeTracerProvider({
  sampler: new AlwaysOnSampler(),
  idGenerator: {
    generateTraceId: () => currentTraceId,
    generateSpanId: () => randomBytes(8).toString("hex"),
  },
  spanProcessors: [
    new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl,
      environment: "tracelift-demo",
    }),
  ],
});
provider.register();

const profiles = [
  { name: "healthy", issues: [] },
  { name: "healthy", issues: [] },
  { name: "missing-model-instrumentation", issues: ["NO_GENERATIONS"] },
  { name: "lost-async-context", issues: ["NO_NESTING"] },
  { name: "missing-model-payloads", issues: ["EMPTY_GENERATION_IO"] },
  { name: "missing-request-payloads", issues: ["EMPTY_ROOT_IO"] },
  { name: "noisy-auto-instrumentation", issues: ["INFRASTRUCTURE_SPANS"] },
  {
    name: "empty-noisy-model",
    issues: ["EMPTY_GENERATION_IO", "INFRASTRUCTURE_SPANS"],
  },
  {
    name: "broken-model-tracing",
    issues: [
      "NO_NESTING",
      "EMPTY_ROOT_IO",
      "EMPTY_GENERATION_IO",
      "INFRASTRUCTURE_SPANS",
    ],
  },
  {
    name: "broken-span-tracing",
    issues: [
      "NO_GENERATIONS",
      "NO_NESTING",
      "EMPTY_ROOT_IO",
      "INFRASTRUCTURE_SPANS",
    ],
  },
];

const requests = [
  {
    name: "support-refund-agent",
    question: "My headphones arrived damaged. Can I get a replacement?",
    category: "returns",
    facts: {
      orderStatus: "delivered",
      daysSinceDelivery: 3,
      replacementInStock: true,
    },
    policy:
      "Damaged items reported within 30 days qualify for a free replacement.",
    answer:
      "I'm sorry your headphones arrived damaged. Your order qualifies for a free replacement. I can arrange a prepaid return label and send a replacement once the carrier scans your return.",
  },
  {
    name: "subscription-support-agent",
    question:
      "I upgraded yesterday, but my workspace still shows the free plan.",
    category: "billing",
    facts: {
      paymentStatus: "paid",
      purchasedPlan: "team",
      activeWorkspacePlan: "free",
    },
    policy:
      "Paid upgrades should activate immediately. Verify the payment's workspace before retrying provisioning.",
    answer:
      "Your payment completed successfully, but the workspace upgrade has not activated. I'll ask our billing team to reconcile the workspace with your paid subscription. You do not need to pay again.",
  },
  {
    name: "delivery-status-agent",
    question: "Where is my order? The tracking hasn't changed since Monday.",
    category: "shipping",
    facts: {
      carrier: "ParcelPost",
      status: "in_transit",
      lastScanHoursAgo: 36,
      estimatedDaysRemaining: 2,
    },
    policy:
      "Allow 48 hours between carrier scans before opening a shipping investigation.",
    answer:
      "Your order is still in transit and is expected within two days. The last scan was 36 hours ago. If there is no update after another 12 hours, we can open an investigation with the carrier.",
  },
  {
    name: "developer-help-agent",
    question:
      "Our webhook endpoint gets the same event twice. How should we handle retries?",
    category: "technical",
    facts: { deliveryAttempts: 2, firstAttemptStatus: 504, retryStatus: 200 },
    policy:
      "Webhook delivery is at least once. Deduplicate using event ID and return a success response promptly.",
    answer:
      "The first delivery timed out, so the event was retried. Store processed event IDs and skip duplicate processing. Return a 2xx response promptly and move longer tasks to a queue.",
  },
];

const pick = (items) => items[randomInt(items.length)];
const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};
const totals = {};
let profileDeck = [];
let totalObservations = 0;
try {
  for (let index = 0; index < count; index++) {
    currentTraceId = randomBytes(16).toString("hex");
    if (!profileDeck.length) profileDeck = shuffle(profiles);
    const profile = profileDeck.pop();
    const request = pick(requests);
    const observationsPerTrace = randomInt(
      minObservations,
      maxObservations + 1,
    );
    const model = pick(["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"]);
    const has = (issue) => profile.issues.includes(issue);
    const orderId = `DEMO-${randomInt(12000, 99999)}`;
    const customerId = `demo-customer-${randomInt(1, 25)}`;
    const metadata = {
      synthetic: true,
      runId,
      scenario: profile.name,
      expectedIssues: profile.issues,
    };
    await propagateAttributes(
      {
        traceName: request.name,
        userId: customerId,
        sessionId: `tracelift-demo-${runId}-${customerId}`,
        tags: ["tracelift-demo", profile.name],
      },
      async () => {
        const span = (name, input, output, children = []) => ({
          name,
          input,
          output,
          children,
          asType: "span",
        });
        const generation = (name, input, output) => ({
          name,
          input: has("EMPTY_GENERATION_IO") ? undefined : input,
          output: has("EMPTY_GENERATION_IO") ? undefined : output,
          children: [],
          asType: has("NO_GENERATIONS") ? "span" : "generation",
          extra: has("NO_GENERATIONS")
            ? {}
            : {
                model,
                modelParameters: {
                  temperature: pick([0.1, 0.2, 0.3]),
                  max_tokens: 512,
                },
                usageDetails: {
                  input: randomInt(240, 1501),
                  output: randomInt(60, 241),
                },
              },
        });
        const customer = span(
          "load-customer-context",
          { customerId, orderId },
          {
            customer: {
              id: customerId,
              plan: pick(["free", "team", "enterprise"]),
              locale: "en-US",
            },
            order: { id: orderId, ...request.facts },
          },
        );
        const retrieval = span(
          "retrieve-support-policy",
          {
            query: request.question,
            category: request.category,
          },
          {
            documents: [
              {
                id: `policy-${request.category}`,
                title: `${request.category} policy`,
                content: request.policy,
                relevance: randomInt(85, 99) / 100,
              },
            ],
          },
        );
        const draft = generation(
          "draft-customer-reply",
          [
            {
              role: "system",
              content: `You are a customer support agent. Use this verified policy: ${request.policy}`,
            },
            { role: "user", content: request.question },
          ],
          { role: "assistant", content: request.answer },
        );
        const validation = span(
          "validate-response",
          { response: request.answer },
          {
            groundedInPolicy: true,
            containsSensitiveData: false,
            readyToSend: true,
          },
        );
        const root = span(
          request.name,
          has("EMPTY_ROOT_IO")
            ? undefined
            : { message: request.question, orderId },
          has("EMPTY_ROOT_IO")
            ? undefined
            : {
                reply: request.answer,
                resolved: true,
                category: request.category,
              },
          [customer, retrieval, draft, validation],
        );
        let planned = 5;
        if (has("INFRASTRUCTURE_SPANS")) {
          customer.children.push(span("GET /healthz"), span("postgres.query"));
          retrieval.children.push(
            span("HTTP POST /internal/search"),
            span("retry"),
          );
          planned += 4;
        }
        const append = (parent, child, probability = 1) => {
          if (planned >= observationsPerTrace || Math.random() >= probability)
            return false;
          parent.children.push(child);
          planned++;
          return true;
        };
        const context = span(
          "gather-request-context",
          { customerId, orderId, question: request.question },
          {
            customerFound: true,
            policyCategory: request.category,
          },
          [customer, retrieval],
        );
        if (planned < observationsPerTrace && randomInt(10) < 8) {
          root.children.splice(0, 2, context);
          planned++;
        }
        const response = span(
          "prepare-customer-response",
          {
            question: request.question,
            facts: request.facts,
            policy: request.policy,
          },
          { reply: request.answer },
          [draft, validation],
        );
        if (planned < observationsPerTrace && randomInt(10) < 8) {
          root.children.splice(root.children.indexOf(draft), 2, response);
          planned++;
        }
        append(
          customer,
          span(
            "lookup-customer-cache",
            { key: `customer:${customerId}` },
            { hit: Math.random() < 0.7, ttlSeconds: randomInt(60, 600) },
          ),
          0.7,
        );
        append(
          customer,
          span("fetch-order-details", { orderId }, request.facts),
          0.8,
        );
        append(
          retrieval,
          generation(
            "rewrite-search-query",
            [
              {
                role: "system",
                content:
                  "Rewrite the support question as a concise policy search query.",
              },
              { role: "user", content: request.question },
            ],
            {
              role: "assistant",
              content: `${request.category} eligibility and next steps`,
            },
          ),
        );
        append(
          validation,
          span(
            "check-sensitive-data",
            { text: request.answer },
            { matches: [], passed: true },
          ),
        );
        append(
          validation,
          span(
            "check-policy-grounding",
            { text: request.answer, policy: request.policy },
            { supported: true, unsupportedClaims: [] },
          ),
        );

        for (let step = 0; planned < observationsPerTrace; step++) {
          const articleId = `${request.category}-${randomInt(1, 10000)}`;
          const branch = randomInt(3);
          if (branch === 0) {
            const search = span(
              "search-policy-index",
              { query: request.question, partition: step, topK: 3 },
              {
                matches: [{ articleId, score: randomInt(75, 99) / 100 }],
              },
            );
            append(retrieval, search);
            const fetch = span(
              "fetch-policy-article",
              { articleId },
              {
                articleId,
                title: `${request.category} guidance`,
                content: request.policy,
              },
            );
            if (append(search, fetch)) {
              append(
                fetch,
                span(
                  "read-document-cache",
                  { key: `article:${articleId}` },
                  { hit: Math.random() < 0.7, revision: randomInt(1, 8) },
                ),
              );
              append(
                fetch,
                span(
                  "decode-policy-document",
                  { articleId, format: "markdown" },
                  {
                    sections: ["Eligibility", "Resolution"],
                    wordCount: randomInt(150, 1200),
                  },
                ),
              );
            }
          } else if (branch === 1) {
            const check = span(
              "verify-account-eligibility",
              { customerId, orderId, category: request.category },
              {
                eligible: true,
                reason:
                  "Account and order meet the support policy requirements",
              },
            );
            append(customer, check);
            append(
              check,
              span(
                "read-account-entitlements",
                { customerId },
                { supportTier: "standard", accountActive: true },
              ),
            );
            append(
              check,
              span(
                "evaluate-policy-rules",
                { facts: request.facts, policy: request.policy },
                {
                  matchedRules: ["active-account", "valid-request"],
                  decision: "allow",
                },
              ),
            );
          } else {
            const check = span(
              "review-response-section",
              { response: request.answer, section: step },
              {
                approved: true,
                requiresEscalation: false,
              },
            );
            append(validation, check);
            append(
              check,
              generation(
                "assess-response-quality",
                [
                  {
                    role: "system",
                    content: `Check the answer against this policy: ${request.policy}`,
                  },
                  { role: "user", content: request.answer },
                ],
                {
                  role: "assistant",
                  content:
                    "The answer follows the policy and gives the customer a clear next step.",
                },
              ),
            );
            append(
              check,
              span(
                "check-response-tone",
                { text: request.answer },
                { empathetic: true, actionable: true },
              ),
            );
          }
        }

        let ended = 0;
        const emit = async (node, parent) => {
          const attributes = { input: node.input, metadata, ...node.extra };
          const observation =
            !parent || has("NO_NESTING")
              ? startObservation(node.name, attributes, { asType: node.asType })
              : parent.startObservation(node.name, attributes, {
                  asType: node.asType,
                });
          try {
            for (const child of node.children) await emit(child, observation);
            if (!node.children.length) {
              await sleep(
                node.asType === "generation"
                  ? randomInt(120, 650)
                  : randomInt(8, 90),
              );
            }
            if (node.output !== undefined)
              observation.update({ output: node.output });
          } finally {
            observation.end();
            ended++;
            if (ended % 100 === 0) await provider.forceFlush();
          }
        };
        await emit(root);
      },
    );
    totalObservations += observationsPerTrace;
    totals[profile.name] = (totals[profile.name] ?? 0) + 1;
    console.log(
      `${index + 1}/${count} ${profile.name} ${observationsPerTrace} observations ${currentTraceId}`,
    );
    if ((index + 1) % 10 === 0) await provider.forceFlush();
  }
  await provider.forceFlush();
  console.log(
    JSON.stringify({
      baseUrl,
      runId,
      traces: count,
      observationRange: [minObservations, maxObservations],
      observations: totalObservations,
      scenarios: totals,
    }),
  );
} finally {
  await provider.shutdown();
}
