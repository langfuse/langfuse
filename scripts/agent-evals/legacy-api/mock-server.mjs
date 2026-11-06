#!/usr/bin/env node
// Stand-in for the Langfuse Cloud public API. Logs every request as JSONL and
// serves legacy endpoints with the real deprecation signals of a git ref.
//
//   node mock-server.mjs --port 4100 --log requests.jsonl \
//     [--deprecations-ref origin/main] [--phase pre-sunset|post-sunset]
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildFixture, PROJECT } from "./fixture.mjs";
import { loadDeprecations } from "./load-deprecations.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const PUBLIC_KEY = "pk-lf-agent-eval";
export const SECRET_KEY = "sk-lf-agent-eval";

/**
 * LEGACY_ROUTES maps deprecated GET paths to their deprecation export in
 * deprecations.ts. Add an entry (and a handler) to evaluate another endpoint.
 */
const LEGACY_ROUTES = [
  { pattern: /^\/api\/public\/traces\/?$/, deprecation: "TRACES_DEPRECATION", handler: "tracesList" },
  { pattern: /^\/api\/public\/traces\/([^/]+)$/, deprecation: "TRACES_DEPRECATION", handler: "traceById" },
  { pattern: /^\/api\/public\/observations\/?$/, deprecation: "OBSERVATIONS_V1_DEPRECATION", handler: "observationsV1List" },
  { pattern: /^\/api\/public\/observations\/([^/]+)$/, deprecation: "OBSERVATIONS_V1_DEPRECATION", handler: "observationV1ById" },
  { pattern: /^\/api\/public\/sessions\/?$/, deprecation: "SESSIONS_DEPRECATION", handler: "emptyPage" },
  { pattern: /^\/api\/public\/metrics\/?$/, deprecation: "METRICS_DEPRECATION", handler: "emptyData" },
];

export async function startMockServer({ port = 0, logFile, deprecationsRef = "origin/main", phase = "pre-sunset", now = new Date() }) {
  const deprecations = await loadDeprecations(deprecationsRef, REPO_ROOT);
  const fixture = buildFixture({ now });
  const handlers = makeHandlers(fixture);

  const server = createServer(async (req, nodeRes) => {
    const url = new URL(req.url, "http://localhost");
    const body = await readBody(req);
    const res = adaptResponse(nodeRes);
    const entry = { at: new Date().toISOString(), method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), userAgent: req.headers["user-agent"] ?? null };
    try {
      route({ req, url, body, res, deprecations, handlers, phase, entry });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error", error: String(error) });
    }
    entry.status = nodeRes.statusCode;
    if (logFile) appendFileSync(logFile, JSON.stringify(entry) + "\n");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { server, port: server.address().port, fixture };
}

function route({ req, url, body, res, deprecations, handlers, phase, entry }) {
  const path = url.pathname;
  if (!path.startsWith("/api/public")) {
    return res.status(404).json({ message: "Not found" });
  }
  if (!isAuthorized(req.headers.authorization)) {
    return res.status(401).json({ message: "Invalid credentials. Confirm that you've configured the correct host.", error: "UnauthorizedError" });
  }

  const legacy = req.method === "GET" ? LEGACY_ROUTES.find((r) => r.pattern.test(path)) : undefined;
  if (legacy) {
    entry.legacy = true;
    const deprecation = deprecations[legacy.deprecation];
    const stamped = deprecations.withDeprecationResponse(res, deprecation);
    if (phase === "post-sunset") {
      return stamped.status(410).json(cutoffBody(req.method, path, deprecation, deprecations.V3_SUNSET_DATE));
    }
    return handlers[legacy.handler]({ url, res: stamped, match: path.match(legacy.pattern) });
  }

  if (req.method === "GET" && path === "/api/public/projects") return res.status(200).json({ data: [PROJECT] });
  if (req.method === "GET" && path === "/api/public/v2/observations") return handlers.observationsV2({ url, res });
  if (req.method === "GET" && path === "/api/public/v2/metrics") return handlers.metricsV2({ url, res });
  // SDK telemetry and shutdown flushes; accept and drop.
  if (req.method === "POST" && path === "/api/public/otel/v1/traces") return res.status(200).json({});
  if (req.method === "POST" && path === "/api/public/ingestion") {
    const batch = safeJson(body)?.batch ?? [];
    return res.status(207).json({ successes: batch.map((e) => ({ id: e.id, status: 201 })), errors: [] });
  }
  return res.status(404).json({ message: `${req.method} ${path} not found`, error: "LangfuseNotFoundError" });
}

/** cutoffBody is the Cloud 410 body for a legacy GET, with the cutoff at the sunset date. */
function cutoffBody(method, pathname, deprecation, cutoffIsoDate) {
  const cutoff = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${cutoffIsoDate}T00:00:00Z`));
  const apiPath = `${method} ${pathname}`;
  return {
    error: "LEGACY_API_UNAVAILABLE_FOR_NEW_ORGANIZATION",
    message: `${apiPath} is a legacy API that is not available to organizations created on or after ${cutoff}. Migrate this request to ${deprecation.replacement}. See the migration documentation at ${deprecation.docsUrl}.`,
    requestedEndpoint: apiPath,
    replacementEndpoint: deprecation.replacement,
    documentationUrl: deprecation.docsUrl,
  };
}

function makeHandlers(fixture) {
  const byTrace = new Map();
  for (const o of fixture.observations) {
    if (!byTrace.has(o.traceId)) byTrace.set(o.traceId, []);
    byTrace.get(o.traceId).push(o);
  }

  const legacyTrace = (t, fields) => {
    const base = {
      id: t.id, externalId: null, timestamp: t.timestamp, name: t.name, userId: null, metadata: {}, release: null, version: null,
      projectId: PROJECT.id, environment: "default", public: false, bookmarked: false, tags: [], input: null, output: null,
      sessionId: null, createdAt: t.timestamp, updatedAt: t.timestamp, htmlPath: `/project/${PROJECT.id}/traces/${t.id}`,
    };
    if (fields.has("observations")) base.observations = t.observationIds;
    if (fields.has("scores")) base.scores = [];
    if (fields.has("metrics")) Object.assign(base, { totalCost: t.totalCost, latency: t.latency });
    return base;
  };

  const legacyFields = (url) => {
    const raw = url.searchParams.get("fields");
    const all = ["core", "io", "scores", "observations", "metrics"];
    return new Set(raw ? raw.split(",").map((s) => s.trim()).filter((s) => all.includes(s)) : all);
  };

  const page = (url, res, rows) => {
    const p = toInt(url.searchParams.get("page"), 1);
    const limit = toInt(url.searchParams.get("limit"), 50);
    if (p < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Invalid request data", error: [{ code: "too_big", path: ["limit"], message: "Number must be less than or equal to 100" }] });
    }
    const data = rows.slice((p - 1) * limit, p * limit);
    return res.status(200).json({ data, meta: { page: p, limit, totalItems: rows.length, totalPages: Math.ceil(rows.length / limit) } });
  };

  const inRange = (iso, from, to) => (!from || iso >= from) && (!to || iso < to);
  const isoParam = (url, key) => {
    const v = url.searchParams.get(key);
    return v ? new Date(v).toISOString() : undefined;
  };

  return {
    tracesList({ url, res }) {
      const from = isoParam(url, "fromTimestamp");
      const to = isoParam(url, "toTimestamp");
      const fields = legacyFields(url);
      const asc = url.searchParams.get("orderBy") === "timestamp.asc";
      const rows = fixture.traces
        .filter((t) => inRange(t.timestamp, from, to))
        .sort((a, b) => (asc ? 1 : -1) * a.timestamp.localeCompare(b.timestamp))
        .map((t) => legacyTrace(t, fields));
      return page(url, res, rows);
    },
    traceById({ url, res, match }) {
      const t = fixture.traces.find((x) => x.id === decodeURIComponent(match[1]));
      if (!t) return res.status(404).json({ message: "Trace not found within authorized project", error: "LangfuseNotFoundError" });
      const full = legacyTrace(t, legacyFields(url));
      full.observations = (byTrace.get(t.id) ?? []).filter((o) => !o.id.startsWith("t-"));
      full.scores = [];
      return res.status(200).json(full);
    },
    observationsV1List({ url, res }) {
      const traceId = url.searchParams.get("traceId");
      const rows = fixture.observations.filter((o) => !o.id.startsWith("t-") && (!traceId || o.traceId === traceId));
      return page(url, res, rows.map(v1Observation));
    },
    observationV1ById({ res, match }) {
      const o = fixture.observations.find((x) => x.id === decodeURIComponent(match[1]));
      if (!o) return res.status(404).json({ message: "Observation not found within authorized project", error: "LangfuseNotFoundError" });
      return res.status(200).json(v1Observation(o));
    },
    emptyPage({ res }) {
      return res.status(200).json({ data: [], meta: { page: 1, limit: 50, totalItems: 0, totalPages: 0 } });
    },
    emptyData({ res }) {
      return res.status(200).json({ data: [] });
    },
    observationsV2({ url, res }) {
      const limit = toInt(url.searchParams.get("limit"), 50);
      if (limit < 0 || limit > 1000) {
        return res.status(400).json({ message: "Invalid request data", error: [{ code: "too_big", path: ["limit"], message: "Number must be less than or equal to 1000" }] });
      }
      let offset = 0;
      const cursor = url.searchParams.get("cursor");
      if (cursor) {
        const decoded = safeJson(Buffer.from(cursor, "base64").toString("utf8"));
        if (!decoded || typeof decoded.offset !== "number") return res.status(400).json({ message: "Invalid cursor format", error: "InvalidRequestError" });
        offset = decoded.offset;
      }
      const groups = new Set(["core", ...(url.searchParams.get("fields")?.split(",").map((s) => s.trim()) ?? ["basic"])]);
      const from = isoParam(url, "fromStartTime");
      const to = isoParam(url, "toStartTime");
      const filters = ["traceId", "type", "name", "parentObservationId"].map((k) => [k, url.searchParams.get(k)]).filter(([, v]) => v);
      const root = url.searchParams.get("isRootObservation");
      const rows = fixture.observations
        .filter((o) => inRange(o.startTime, from, to))
        .filter((o) => filters.every(([k, v]) => o[k] === v))
        .filter((o) => root === null || String(o.isRootObservation) === root)
        .sort((a, b) => b.startTime.localeCompare(a.startTime) || a.id.localeCompare(b.id));
      const data = rows.slice(offset, offset + limit).map((o) => pickGroups(o, groups));
      const next = offset + limit < rows.length ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString("base64") : undefined;
      return res.status(200).json({ data, meta: next ? { cursor: next } : {} });
    },
    metricsV2({ url, res }) {
      const query = safeJson(url.searchParams.get("query") ?? "");
      if (!query) return res.status(400).json({ message: "Invalid JSON in query parameter", error: "InvalidRequestError" });
      if (query.view !== "observations") {
        return res.status(400).json({ message: `This mock only serves view "observations" (got "${query.view}")`, error: "InvalidRequestError" });
      }
      const dims = (query.dimensions ?? []).map((d) => d.field);
      const metrics = query.metrics ?? [];
      const highCard = dims.filter((d) => d === "traceId" || d === "id");
      const orderBy = query.orderBy ?? [];
      if (highCard.length > 0) {
        const list = highCard.map((d) => `'${d}'`).join(", ");
        if (query.timeDimension) {
          return res.status(400).json({ message: `High cardinality dimension(s) ${list} cannot be used with timeDimension. Time series queries with high cardinality dimensions produce unbounded result sets.`, error: "InvalidRequestError" });
        }
        const desc = orderBy.find((o) => o.direction === "desc");
        if (!query.config?.row_limit || !desc) {
          return res.status(400).json({ message: `High cardinality dimension(s) ${list} require both 'config.row_limit' and 'orderBy' with direction 'desc' on a measure field.`, error: "InvalidRequestError" });
        }
      }
      const from = query.fromTimestamp ? new Date(query.fromTimestamp).toISOString() : undefined;
      const to = query.toTimestamp ? new Date(query.toTimestamp).toISOString() : undefined;
      let rows = fixture.observations.filter((o) => inRange(o.startTime, from, to));
      for (const f of query.filters ?? []) {
        if (f.operator === "any of") rows = rows.filter((o) => f.value.includes(o[f.column]));
        else if (f.operator === "=") rows = rows.filter((o) => o[f.column] === f.value);
      }
      const groups = new Map();
      for (const o of rows) {
        const key = JSON.stringify(dims.map((d) => o[d] ?? null));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(o);
      }
      let data = [...groups.entries()].map(([key, members]) => {
        const row = Object.fromEntries(dims.map((d, i) => [d, JSON.parse(key)[i]]));
        for (const m of metrics) {
          const values = members.map((o) => (m.measure === "count" ? 1 : Number(o[m.measure] ?? 0)));
          row[`${m.aggregation}_${m.measure}`] = aggregate(m.aggregation, values);
        }
        return row;
      });
      for (const o of [...orderBy].reverse()) {
        data.sort((a, b) => (o.direction === "desc" ? -1 : 1) * ((a[o.field] ?? 0) > (b[o.field] ?? 0) ? 1 : (a[o.field] ?? 0) < (b[o.field] ?? 0) ? -1 : 0));
      }
      data = data.slice(0, query.config?.row_limit ?? 100);
      return res.status(200).json({ data });
    },
  };
}

const GROUP_FIELDS = {
  core: ["id", "traceId", "startTime", "endTime", "projectId", "parentObservationId", "type"],
  basic: ["name", "level", "statusMessage", "version", "environment", "bookmarked", "public", "userId", "sessionId", "isRootObservation"],
  time: ["completionStartTime", "createdAt", "updatedAt"],
  io: ["input", "output"],
  metadata: ["metadata"],
  model: ["model", "internalModelId", "modelParameters"],
  usage: ["usageDetails", "costDetails", "totalCost", "usagePricingTierName"],
  prompt: ["promptId", "promptName", "promptVersion"],
  metrics: ["latency", "timeToFirstToken"],
  trace_context: ["tags", "release", "traceName"],
};

function pickGroups(o, groups) {
  const out = {};
  for (const g of groups) for (const f of GROUP_FIELDS[g] ?? []) out[f] = o[f];
  return Object.assign(out, { modelId: null, inputPrice: null, outputPrice: null, totalPrice: null });
}

function v1Observation(o) {
  return { ...o, calculatedTotalCost: o.totalCost, usage: o.usageDetails };
}

function aggregate(kind, values) {
  if (kind === "count") return values.length;
  if (kind === "sum") return values.reduce((a, b) => a + b, 0);
  if (kind === "avg") return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  if (kind === "max") return Math.max(...values);
  if (kind === "min") return Math.min(...values);
  return null;
}

function isAuthorized(header) {
  if (!header?.startsWith("Basic ")) return false;
  return Buffer.from(header.slice(6), "base64").toString("utf8") === `${PUBLIC_KEY}:${SECRET_KEY}`;
}

/** adaptResponse gives node's ServerResponse the NextApiResponse surface deprecations.ts uses. */
function adaptResponse(nodeRes) {
  const res = {
    get statusCode() {
      return nodeRes.statusCode;
    },
    setHeader: (k, v) => nodeRes.setHeader(k, v),
    getHeader: (k) => nodeRes.getHeader(k),
    status(code) {
      nodeRes.statusCode = code;
      return res;
    },
    json(body) {
      nodeRes.setHeader("Content-Type", "application/json; charset=utf-8");
      nodeRes.end(JSON.stringify(body));
      return res;
    },
  };
  return res;
}

function readBody(req) {
  return new Promise((r) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => r(Buffer.concat(chunks).toString("utf8")));
  });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function toInt(v, fallback) {
  if (v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "4100" },
      log: { type: "string" },
      "deprecations-ref": { type: "string", default: "origin/main" },
      phase: { type: "string", default: "pre-sunset" },
    },
  });
  const { port } = await startMockServer({ port: Number(values.port), logFile: values.log, deprecationsRef: values["deprecations-ref"], phase: values.phase });
  console.log(`mock Langfuse API on http://127.0.0.1:${port} (${values.phase}, deprecations@${values["deprecations-ref"]})`);
}
