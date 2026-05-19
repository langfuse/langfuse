/** template.ts contains Monitor message template validation and rendering. */
import type { MonitorSeverity, MonitorThresholdOperator } from "@prisma/client";
import Handlebars from "handlebars";
import { LRUCache } from "lru-cache";
import { DAY, HOUR, MINUTE, WEEK } from "./internal";
import type { Monitor } from "./types";

/**
 * MonitorMessageContext is the allowlisted context passed to a Monitor
 * message template at render time. Templates may only reference these
 * top-level keys. Names mirror Datadog's monitor variables
 * (https://docs.datadoghq.com/monitors/notify/variables/).
 */
export type MonitorMessageContext = {
  value: string;
  threshold: string;
  warn_threshold: string | null;
  comparator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  window: string;
  permalink: string;

  is_ok: boolean;
  is_alert: boolean;
  is_warning: boolean;
  is_no_data: boolean;
  is_unknown: boolean;

  was_ok: boolean;
  was_alert: boolean;
  was_warning: boolean;
  was_no_data: boolean;
  was_unknown: boolean;

  is_recovery: boolean;
  is_escalation: boolean;
  is_renotify: boolean;

  last_triggered_at: string;
  last_triggered_at_epoch: string;
};

const monitorMessageContextKeys = new Set<string>([
  "value",
  "threshold",
  "warn_threshold",
  "comparator",
  "window",
  "permalink",
  "is_ok",
  "is_alert",
  "is_warning",
  "is_no_data",
  "is_unknown",
  "was_ok",
  "was_alert",
  "was_warning",
  "was_no_data",
  "was_unknown",
  "is_recovery",
  "is_escalation",
  "is_renotify",
  "last_triggered_at",
  "last_triggered_at_epoch",
] satisfies (keyof MonitorMessageContext)[]);

/**
 * ALLOWED_BLOCK_HELPERS is the closed set of block helpers a Monitor
 * template may use. `if`/`unless`/`each`/`with` stay rejected.
 */
const ALLOWED_BLOCK_HELPERS = new Set(["and", "or"]);

/**
 * monitorHandlebars is a sandboxed Handlebars instance with the `and`
 * and `or` block helpers registered. Both validator parse and renderer
 * compile go through it so AST allowlist and runtime stay in lock-step.
 */
export const monitorHandlebars = Handlebars.create();
monitorHandlebars.registerHelper(
  "and",
  function (this: unknown, ...args: unknown[]) {
    const options = args.pop() as Handlebars.HelperOptions;
    return args.every(Boolean) ? options.fn(this) : options.inverse(this);
  },
);
monitorHandlebars.registerHelper(
  "or",
  function (this: unknown, ...args: unknown[]) {
    const options = args.pop() as Handlebars.HelperOptions;
    return args.some(Boolean) ? options.fn(this) : options.inverse(this);
  },
);

/**
 * validateMonitorTemplate returns true when `source` is a Handlebars
 * template whose AST only references `MonitorMessageContext` keys, uses
 * only the `{{#and}}` / `{{#or}}` block helpers (recursively), and does
 * not invoke other helpers, partials, decorators, or unescaped output.
 */
export const validateMonitorTemplate = (source: string): boolean => {
  let ast: hbs.AST.Program;
  try {
    ast = monitorHandlebars.parse(source);
  } catch {
    return false;
  }
  return ast.body.every(isAllowedStatement);
};

const isAllowedStatement = (node: hbs.AST.Statement): boolean => {
  switch (node.type) {
    case "ContentStatement":
    case "CommentStatement":
      return true;
    case "MustacheStatement": {
      const m = node as hbs.AST.MustacheStatement;
      if (m.escaped === false) return false;
      if (m.params.length > 0) return false;
      if (m.hash) return false;
      return isAllowedPath(m.path);
    }
    case "BlockStatement": {
      const b = node as hbs.AST.BlockStatement;
      if (b.path.type !== "PathExpression") return false;
      const head = (b.path as hbs.AST.PathExpression).parts[0];
      if (typeof head !== "string" || !ALLOWED_BLOCK_HELPERS.has(head)) {
        return false;
      }
      if (b.hash) return false;
      if (b.params.length === 0) return false;
      if (!b.params.every(isAllowedParam)) return false;
      if (!b.program.body.every(isAllowedStatement)) return false;
      if (b.inverse && !b.inverse.body.every(isAllowedStatement)) return false;
      return true;
    }
    default:
      return false;
  }
};

const isAllowedPath = (
  path: hbs.AST.PathExpression | hbs.AST.Literal,
): boolean => {
  if (path.type !== "PathExpression") return false;
  const p = path as hbs.AST.PathExpression;
  if (p.data) return false;
  if (p.depth !== 0) return false;
  if (p.parts.length !== 1) return false;
  const head = p.parts[0];
  if (typeof head !== "string") return false;
  return monitorMessageContextKeys.has(head);
};

const isAllowedParam = (node: hbs.AST.Expression): boolean => {
  if (node.type === "PathExpression") return isAllowedPath(node);
  if (node.type === "SubExpression") {
    const sub = node as hbs.AST.SubExpression;
    if (sub.path.type !== "PathExpression") return false;
    const head = (sub.path as hbs.AST.PathExpression).parts[0];
    if (typeof head !== "string" || !ALLOWED_BLOCK_HELPERS.has(head)) {
      return false;
    }
    if (sub.hash) return false;
    if (sub.params.length === 0) return false;
    return sub.params.every(isAllowedParam);
  }
  return false;
};

/**
 * DEFAULT_MONITOR_TEMPLATE_CACHE_SIZE bounds the LRU cache of compiled
 * templates inside `MonitorTemplateRenderer`.
 */
export const DEFAULT_MONITOR_TEMPLATE_CACHE_SIZE = 1000;

/**
 * MonitorTemplateRenderer compiles Monitor message templates and caches
 * the compiled functions in an LRU keyed by template source.
 *
 * `baseUrl` is the deployment URL used to build `{{permalink}}`. On the
 * worker, pass `env.NEXTAUTH_URL`.
 */
export class MonitorTemplateRenderer {
  private readonly cache: LRUCache<string, HandlebarsTemplateDelegate>;
  private readonly baseUrl: string;

  constructor(opts: { baseUrl: string; max?: number }) {
    this.baseUrl = opts.baseUrl;
    this.cache = new LRUCache({
      max: opts.max ?? DEFAULT_MONITOR_TEMPLATE_CACHE_SIZE,
    });
  }

  render(params: {
    template: string;
    from: Monitor | null;
    to: Monitor;
    aggregation: { value: number; type: string };
  }): string {
    let compiled = this.cache.get(params.template);
    if (!compiled) {
      compiled = monitorHandlebars.compile(params.template, {
        noEscape: true,
      });
      this.cache.set(params.template, compiled);
    }
    return compiled(toMonitorMessageContext(params, this.baseUrl));
  }

  get size(): number {
    return this.cache.size;
  }
}

const toMonitorMessageContext = (
  p: {
    from: Monitor | null;
    to: Monitor;
    aggregation: { value: number; type: string };
  },
  baseUrl: string,
): MonitorMessageContext => {
  const { from, to, aggregation } = p;
  const cur = to.severity;
  const prev = from?.severity ?? null;

  return {
    value: formatAggregationValue(aggregation.value, aggregation.type),
    threshold: formatAggregationValue(
      Number(to.alertThreshold),
      aggregation.type,
    ),
    warn_threshold:
      to.warningThreshold === null
        ? null
        : formatAggregationValue(Number(to.warningThreshold), aggregation.type),
    comparator: thresholdOperatorToSymbol(to.thresholdOperator),
    window: windowMsToHumanString(to.window),
    permalink: `${baseUrl}/project/${to.projectId}/monitors/${to.id}`,

    is_ok: cur === "OK",
    is_alert: cur === "ALERT",
    is_warning: cur === "WARNING",
    is_no_data: cur === "NO_DATA",
    is_unknown: cur === "UNKNOWN",

    was_ok: prev === "OK",
    was_alert: prev === "ALERT",
    was_warning: prev === "WARNING",
    was_no_data: prev === "NO_DATA",
    was_unknown: prev === "UNKNOWN",

    is_recovery: cur === "OK" && prev !== null && prev !== "OK",
    is_escalation:
      from !== null && severityRank(cur) > severityRank(from.severity),

    is_renotify:
      from !== null &&
      from.severity === to.severity &&
      to.alertedAt !== null &&
      (from.alertedAt === null ||
        from.alertedAt.getTime() !== to.alertedAt.getTime()),

    last_triggered_at: to.alertedAt?.toISOString() ?? "",
    last_triggered_at_epoch: to.alertedAt ? String(to.alertedAt.getTime()) : "",
  };
};

const thresholdOperatorToSymbol = (
  op: MonitorThresholdOperator,
): MonitorMessageContext["comparator"] => {
  switch (op) {
    case "GT":
      return ">";
    case "GTE":
      return ">=";
    case "LT":
      return "<";
    case "LTE":
      return "<=";
    case "EQ":
      return "==";
    case "NEQ":
      return "!=";
  }
};

const windowMsToHumanString = (ms: bigint): string => {
  if (ms >= WEEK) {
    const weeks = ms / WEEK;
    return `last ${weeks} week${weeks === 1n ? "" : "s"}`;
  }
  if (ms >= DAY) {
    const days = ms / DAY;
    return `last ${days} day${days === 1n ? "" : "s"}`;
  }
  if (ms >= HOUR) {
    const hours = ms / HOUR;
    return `last ${hours} hour${hours === 1n ? "" : "s"}`;
  }
  const minutes = ms / MINUTE;
  return `last ${minutes} minute${minutes === 1n ? "" : "s"}`;
};

const SEVERITY_RANK: Record<MonitorSeverity, number> = {
  OK: 0,
  UNKNOWN: 1,
  NO_DATA: 2,
  WARNING: 3,
  ALERT: 4,
};

const severityRank = (s: MonitorSeverity): number => SEVERITY_RANK[s];

const formatAggregationValue = (value: number, type: string): string => {
  switch (type) {
    case "millisecond":
      return `${value.toLocaleString("en-US")}ms`;
    case "USD":
      return `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "tokens":
      return `${value.toLocaleString("en-US")} tokens`;
    case "tokens/s":
      return `${value.toLocaleString("en-US")} tokens/s`;
    default:
      return value.toLocaleString("en-US");
  }
};
