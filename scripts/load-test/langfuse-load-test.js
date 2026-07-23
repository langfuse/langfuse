/**
 * Langfuse load test - injecting realistic traces via the ingestion API.
 *
 * Goal: simulate a throughput of LLM traces (trace -> generation -> score)
 * to verify that ClickHouse storage growth stays proportional to the
 * volume actually ingested (see https://github.com/orgs/langfuse/discussions/5687).
 *
 * Usage:
 *   k6 run \
 *     -e LANGFUSE_URL=https://url-langfuse \
 *     -e LANGFUSE_PUBLIC_KEY=pk-lf-xxx \
 *     -e LANGFUSE_SECRET_KEY=sk-lf-xxx \
 *     -e TRACES_PER_SEC=5 \
 *     -e DURATION_MIN=60 \
 *     -e GENERATIONS_PER_TRACE=3 \
 *     -e PROMPT_TOKENS_AVG=800 \
 *     -e COMPLETION_TOKENS_AVG=250 \
 *     langfuse-load-test.js
 *
 * Tip: run this script as a Kubernetes Job to stay within your usual infra and
 * be able to easily re-run it in your CI.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
// Local random string helper — no remote dependency required
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Clamp value between min and max; NaN falls back to the provided default
function clamp(value, min, max) {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

// ---- Config via environment variables ----
const LANGFUSE_URL = __ENV.LANGFUSE_URL || 'http://localhost:3000';
const PUBLIC_KEY = __ENV.LANGFUSE_PUBLIC_KEY;
const SECRET_KEY = __ENV.LANGFUSE_SECRET_KEY;
const TRACES_PER_SEC = clamp(parseInt(__ENV.TRACES_PER_SEC, 10) || 1, 1, Infinity);
const DURATION_MIN = clamp(parseInt(__ENV.DURATION_MIN, 10) || 60, 1, Infinity);
const GENERATIONS_PER_TRACE = clamp(parseInt(__ENV.GENERATIONS_PER_TRACE, 10) || 2, 0, Infinity);
const PROMPT_TOKENS_AVG = clamp(parseInt(__ENV.PROMPT_TOKENS_AVG, 10) || 500, 1, Infinity);
const COMPLETION_TOKENS_AVG = clamp(parseInt(__ENV.COMPLETION_TOKENS_AVG, 10) || 200, 1, Infinity);

if (!PUBLIC_KEY || !SECRET_KEY) {
  throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required');
}

const ingestedTraces = new Counter('langfuse_traces_ingested');
const ingestedEvents = new Counter('langfuse_events_ingested');
const ingestDuration = new Trend('langfuse_ingest_duration_ms');

export const options = {
  scenarios: {
    trace_injection: {
      executor: 'constant-arrival-rate',
      rate: TRACES_PER_SEC,
      timeUnit: '1s',
      duration: `${DURATION_MIN}m`,
      preAllocatedVUs: Math.max(10, Math.ceil(TRACES_PER_SEC * 2)),
      maxVUs: Math.max(50, Math.ceil(TRACES_PER_SEC * 10)),
    },
  },
};

function randomTokens(avg) {
  // +/- 40% jitter around the average, for a realistic profile
  const jitter = 0.6 + Math.random() * 0.8;
  return Math.max(1, Math.round(avg * jitter));
}

function buildBatch() {
  const now = new Date().toISOString();
  const traceId = `loadtest-${randomString(16)}`;
  const events = [];

  events.push({
    id: randomString(16),
    type: 'trace-create',
    timestamp: now,
    body: {
      id: traceId,
      name: 'loadtest-conversation',
      userId: `synthetic-user-${randomString(6)}`,
      sessionId: `synthetic-session-${randomString(6)}`,
      tags: ['load-test'],
      input: { question: 'Synthetic load test question.' },
      output: { answer: 'Synthetic load test answer.' },
      metadata: { source: 'k6-load-test' },
    },
  });

  for (let i = 0; i < GENERATIONS_PER_TRACE; i++) {
    const genId = randomString(16);
    const promptTokens = randomTokens(PROMPT_TOKENS_AVG);
    const completionTokens = randomTokens(COMPLETION_TOKENS_AVG);
    const startTime = now;

    events.push({
      id: randomString(16),
      type: 'generation-create',
      timestamp: now,
      body: {
        id: genId,
        traceId: traceId,
        name: `step-${i}`,
        model: 'gpt-4o-mini',
        startTime: startTime,
        endTime: new Date(Date.now() + 800).toISOString(),
        input: [{ role: 'user', content: 'x'.repeat(promptTokens * 4) }],
        output: { role: 'assistant', content: 'x'.repeat(completionTokens * 4) },
        usage: {
          promptTokens: promptTokens,
          completionTokens: completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        metadata: { step: i },
      },
    });

    events.push({
      id: randomString(16),
      type: 'score-create',
      timestamp: now,
      body: {
        traceId: traceId,
        observationId: genId,
        name: 'synthetic-quality',
        value: Math.random(),
      },
    });
  }

  return { batch: events, metadata: { sdk: 'k6-load-test' } };
}

export default function () {
  const payload = buildBatch();
  const auth = `Basic ${encoding_b64encode(`${PUBLIC_KEY}:${SECRET_KEY}`)}`;

  const res = http.post(
    `${LANGFUSE_URL}/api/public/ingestion`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
    }
  );

  check(res, {
    'status 200/207': (r) => r.status === 200 || r.status === 207,
  });

  ingestDuration.add(res.timings.duration);
  ingestedTraces.add(1);
  ingestedEvents.add(payload.batch.length);

  sleep(0.01);
}

// small base64 helper without external dependency
function encoding_b64encode(str) {
  return encodeURIComponentToBase64(str);
}
function encodeURIComponentToBase64(str) {
  // k6 provides an encoding module, but we use a simple implementation here
  const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  const bytes = [];
  for (let j = 0; j < str.length; j++) bytes.push(str.charCodeAt(j));
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;
    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const enc4 = isNaN(b3) ? 64 : b3 & 63;
    result +=
      b64chars.charAt(enc1) +
      b64chars.charAt(enc2) +
      (enc3 === 64 ? '=' : b64chars.charAt(enc3)) +
      (enc4 === 64 ? '=' : b64chars.charAt(enc4));
  }
  return result;
}
