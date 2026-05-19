import { describe, it, expect } from "vitest";

import {
  DEFAULT_MONITOR_TEMPLATE_CACHE_SIZE,
  MonitorTemplateRenderer,
  validateMonitorTemplate,
} from "./template";
import { MonitorWindow } from "./types";
import type { Monitor } from "./types";

describe("validateMonitorTemplate", () => {
  it("accepts the empty string", () => {
    expect(validateMonitorTemplate("")).toBe(true);
  });

  it("accepts plain text without any handlebars", () => {
    expect(validateMonitorTemplate("hello world")).toBe(true);
  });

  it.each([
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
  ])("accepts {{%s}}", (key) => {
    expect(validateMonitorTemplate(`x {{${key}}} y`)).toBe(true);
  });

  it("accepts a mix of text and multiple variables", () => {
    expect(
      validateMonitorTemplate(
        "Alert {{value}} crossed {{threshold}} in {{window}}",
      ),
    ).toBe(true);
  });

  it("accepts a handlebars comment", () => {
    expect(validateMonitorTemplate("{{! a comment }}hi {{value}}")).toBe(true);
  });

  it("rejects a template referencing an unknown variable", () => {
    expect(validateMonitorTemplate("{{foo}}")).toBe(false);
  });

  it("rejects unescaped {{{value}}}", () => {
    expect(validateMonitorTemplate("{{{value}}}")).toBe(false);
  });

  it.each([
    "{{#if is_alert}}x{{/if}}",
    "{{#unless is_ok}}x{{/unless}}",
    "{{#each value}}x{{/each}}",
    "{{#with value}}x{{/with}}",
  ])("rejects a non-allowlisted block helper: %s", (template) => {
    expect(validateMonitorTemplate(template)).toBe(false);
  });

  it("rejects an inline helper invocation", () => {
    expect(validateMonitorTemplate("{{lookup value 0}}")).toBe(false);
  });

  it("rejects a partial", () => {
    expect(validateMonitorTemplate("{{> myPartial}}")).toBe(false);
  });

  it("rejects a sub-expression argument", () => {
    expect(validateMonitorTemplate("{{value (lookup value 0)}}")).toBe(false);
  });

  it("rejects malformed handlebars", () => {
    expect(validateMonitorTemplate("{{value")).toBe(false);
  });

  it.each(["{{@is_alert}}", "{{@value}}", "{{@threshold}}", "{{@root}}"])(
    "rejects an @-prefixed data reference: %s",
    (template) => {
      expect(validateMonitorTemplate(template)).toBe(false);
    },
  );

  it.each(["{{../value}}", "{{../is_alert}}"])(
    "rejects a parent-context reference: %s",
    (template) => {
      expect(validateMonitorTemplate(template)).toBe(false);
    },
  );

  it.each(["{{value.length}}", "{{window.constructor}}"])(
    "rejects a sub-property reference: %s",
    (template) => {
      expect(validateMonitorTemplate(template)).toBe(false);
    },
  );

  describe("{{#and}} / {{#or}} block helpers", () => {
    it("accepts {{#and is_alert was_warning}}x{{/and}}", () => {
      expect(
        validateMonitorTemplate("{{#and is_alert was_warning}}x{{/and}}"),
      ).toBe(true);
    });

    it("accepts {{#or is_alert is_warning}}x{{/or}}", () => {
      expect(
        validateMonitorTemplate("{{#or is_alert is_warning}}x{{/or}}"),
      ).toBe(true);
    });

    it("accepts a nested (or ...) sub-expression inside {{#and}}", () => {
      expect(
        validateMonitorTemplate(
          "{{#and is_alert (or is_renotify was_alert)}}x{{/and}}",
        ),
      ).toBe(true);
    });

    it("accepts an {{else}} inverse branch inside {{#and}}", () => {
      expect(
        validateMonitorTemplate(
          "{{#and is_alert was_warning}}HIT{{else}}MISS{{/and}}",
        ),
      ).toBe(true);
    });

    it("accepts a {{value}} mustache inside the block body", () => {
      expect(
        validateMonitorTemplate(
          "{{#and is_alert was_warning}}{{value}}{{/and}}",
        ),
      ).toBe(true);
    });

    it("rejects a forbidden sub-expression argument", () => {
      expect(
        validateMonitorTemplate("{{#and (lookup value 0) is_alert}}x{{/and}}"),
      ).toBe(false);
    });

    it("rejects an unknown variable as a block argument", () => {
      expect(validateMonitorTemplate("{{#and is_alert foo}}x{{/and}}")).toBe(
        false,
      );
    });

    it("rejects {{#and}} with no arguments", () => {
      expect(validateMonitorTemplate("{{#and}}x{{/and}}")).toBe(false);
    });
  });
});

// --- MonitorTemplateRenderer ---

const baseUrl = "https://cloud.langfuse.com";

const buildMonitor = (overrides: Partial<Monitor> = {}): Monitor =>
  ({
    id: "mon_01",
    createdAt: new Date("2026-05-19T00:00:00.000Z"),
    updatedAt: new Date("2026-05-19T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    projectId: "proj_01",

    view: "OBSERVATIONS",
    filters: [],
    metric: { measure: "count", aggregation: "count" },

    window: MonitorWindow.FIVE_MIN,
    thresholdOperator: "GT",
    alertThreshold: 100,
    warningThreshold: 50,

    noData: { mode: "SILENT" },
    renotify: { mode: "OFF" },

    name: "Title",
    message: "Body",
    tags: [],

    severity: "OK",
    severityChangedAt: null,
    alertedAt: null,

    status: "ACTIVE",
    nextRunAt: new Date("2026-05-19T00:01:00.000Z"),
    lastPublishedRunAt: null,
    lastCompletedRunAt: null,

    ...overrides,
  }) as Monitor;

const FULL_CONTEXT_TEMPLATE =
  "value={{value}}\n" +
  "threshold={{threshold}}\n" +
  "warn_threshold={{warn_threshold}}\n" +
  "comparator={{comparator}}\n" +
  "window={{window}}\n" +
  "permalink={{permalink}}\n" +
  "is_ok={{is_ok}} is_alert={{is_alert}} is_warning={{is_warning}} is_no_data={{is_no_data}} is_unknown={{is_unknown}}\n" +
  "was_ok={{was_ok}} was_alert={{was_alert}} was_warning={{was_warning}} was_no_data={{was_no_data}} was_unknown={{was_unknown}}\n" +
  "is_recovery={{is_recovery}} is_escalation={{is_escalation}} is_renotify={{is_renotify}}\n" +
  "last_triggered_at={{last_triggered_at}} last_triggered_at_epoch={{last_triggered_at_epoch}}";

describe("MonitorTemplateRenderer", () => {
  describe("snapshots per scenario (covers every flag)", () => {
    const aggregation = { value: 5432, type: "millisecond" } as const;

    it("renders a fresh alert (OK → ALERT)", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({ severity: "OK" });
      const to = buildMonitor({
        severity: "ALERT",
        alertedAt: new Date("2026-05-19T12:00:00.000Z"),
      });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });

    it("renders a fresh warning (OK → WARNING)", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({ severity: "OK" });
      const to = buildMonitor({
        severity: "WARNING",
        alertedAt: new Date("2026-05-19T12:00:00.000Z"),
      });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });

    it("renders a fresh no-data (OK → NO_DATA)", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({ severity: "OK" });
      const to = buildMonitor({
        severity: "NO_DATA",
        alertedAt: new Date("2026-05-19T12:00:00.000Z"),
      });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });

    it("renders the initial unknown state (from=null, to=UNKNOWN)", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const to = buildMonitor({ severity: "UNKNOWN" });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from: null,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });

    it("renders a recovery (ALERT → OK)", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({
        severity: "ALERT",
        alertedAt: new Date("2026-05-19T11:00:00.000Z"),
      });
      const to = buildMonitor({
        severity: "OK",
        alertedAt: new Date("2026-05-19T12:00:00.000Z"),
      });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });

    it("renders a warning → alert escalation", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({
        severity: "WARNING",
        alertedAt: new Date("2026-05-19T11:00:00.000Z"),
      });
      const to = buildMonitor({
        severity: "ALERT",
        alertedAt: new Date("2026-05-19T12:00:00.000Z"),
      });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });

    it("renders a sustained-alert renotify", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({
        severity: "ALERT",
        alertedAt: new Date("2026-05-19T11:00:00.000Z"),
      });
      const to = buildMonitor({
        severity: "ALERT",
        alertedAt: new Date("2026-05-19T12:00:00.000Z"),
      });
      expect(
        renderer.render({
          template: FULL_CONTEXT_TEMPLATE,
          from,
          to,
          aggregation,
        }),
      ).toMatchSnapshot();
    });
  });

  describe("LRU cache", () => {
    const monitor = buildMonitor();
    const aggregation = { value: 1, type: "" } as const;

    it("caches compiled templates by source string", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      renderer.render({
        template: "{{value}}",
        from: null,
        to: monitor,
        aggregation,
      });
      expect(renderer.size).toBe(1);

      // Same source — cache hit, size unchanged.
      renderer.render({
        template: "{{value}}",
        from: null,
        to: monitor,
        aggregation,
      });
      expect(renderer.size).toBe(1);

      // Different source — cache miss, new entry.
      renderer.render({
        template: "{{threshold}}",
        from: null,
        to: monitor,
        aggregation,
      });
      expect(renderer.size).toBe(2);
    });

    it("evicts least-recently-used entries past max", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl, max: 2 });
      for (const t of ["A {{value}}", "B {{value}}", "C {{value}}"]) {
        renderer.render({
          template: t,
          from: null,
          to: monitor,
          aggregation,
        });
      }
      expect(renderer.size).toBe(2);
    });

    it("re-renders correctly after an entry is evicted", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl, max: 2 });
      renderer.render({
        template: "A {{value}}",
        from: null,
        to: monitor,
        aggregation,
      });
      renderer.render({
        template: "B {{value}}",
        from: null,
        to: monitor,
        aggregation,
      });
      renderer.render({
        template: "C {{value}}",
        from: null,
        to: monitor,
        aggregation,
      });
      // "A …" is now evicted; re-rendering it should still produce the
      // correct output (forced recompile).
      const output = renderer.render({
        template: "A {{value}}",
        from: null,
        to: monitor,
        aggregation: { value: 42, type: "" },
      });
      expect(output).toBe("A 42");
      expect(renderer.size).toBe(2);
    });

    it("defaults to DEFAULT_MONITOR_TEMPLATE_CACHE_SIZE when max is omitted", () => {
      // Just a smoke check that the constant is exported and a renderer
      // built with the default behaves sanely.
      expect(DEFAULT_MONITOR_TEMPLATE_CACHE_SIZE).toBeGreaterThan(0);
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      renderer.render({
        template: "x {{value}}",
        from: null,
        to: monitor,
        aggregation,
      });
      expect(renderer.size).toBe(1);
    });
  });

  describe("comparator + window mapping", () => {
    const aggregation = { value: 0, type: "" } as const;

    it.each([
      ["GT", ">"],
      ["GTE", ">="],
      ["LT", "<"],
      ["LTE", "<="],
      ["EQ", "=="],
      ["NEQ", "!="],
    ] as const)(
      "renders comparator for thresholdOperator=%s",
      (op, expected) => {
        const renderer = new MonitorTemplateRenderer({ baseUrl });
        const to = buildMonitor({ thresholdOperator: op });
        const output = renderer.render({
          template: "{{comparator}}",
          from: null,
          to,
          aggregation,
        });
        expect(output).toBe(expected);
      },
    );

    it.each([
      [MonitorWindow.FIVE_MIN, "last 5 minutes"],
      [MonitorWindow.ONE_HOUR, "last 1 hour"],
      [MonitorWindow.TWO_HOUR, "last 2 hours"],
      [MonitorWindow.ONE_DAY, "last 1 day"],
      [MonitorWindow.TWO_DAY, "last 2 days"],
      [MonitorWindow.ONE_WEEK, "last 1 week"],
    ])("renders window for %s ms", (windowMs, expected) => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const to = buildMonitor({ window: windowMs });
      const output = renderer.render({
        template: "{{window}}",
        from: null,
        to,
        aggregation,
      });
      expect(output).toBe(expected);
    });
  });

  describe("aggregation.type value formatter", () => {
    const monitor = buildMonitor({
      alertThreshold: 1000,
      warningThreshold: 500,
    });

    it.each([
      ["millisecond", 5432, "5,432ms", "1,000ms"],
      ["USD", 1234.567, "$1,234.57", "$1,000.00"],
      ["tokens", 5432, "5,432 tokens", "1,000 tokens"],
      ["tokens/s", 5432, "5,432 tokens/s", "1,000 tokens/s"],
      ["traces", 5432, "5,432", "1,000"],
      ["observations", 5432, "5,432", "1,000"],
      ["scores", 5432, "5,432", "1,000"],
      ["users", 5432, "5,432", "1,000"],
      ["sessions", 5432, "5,432", "1,000"],
      ["calls", 5432, "5,432", "1,000"],
      ["tools", 5432, "5,432", "1,000"],
      ["unknown-unit", 5432, "5,432", "1,000"],
    ] as const)(
      "formats type=%s value=%s as %s / threshold %s",
      (type, value, expectedValue, expectedThreshold) => {
        const renderer = new MonitorTemplateRenderer({ baseUrl });
        const output = renderer.render({
          template: "{{value}} / {{threshold}}",
          from: null,
          to: monitor,
          aggregation: { value, type },
        });
        expect(output).toBe(`${expectedValue} / ${expectedThreshold}`);
      },
    );

    it("renders warn_threshold null as empty string", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const to = buildMonitor({ warningThreshold: null });
      const output = renderer.render({
        template: "[{{warn_threshold}}]",
        from: null,
        to,
        aggregation: { value: 0, type: "millisecond" },
      });
      expect(output).toBe("[]");
    });
  });

  describe("{{#and}} / {{#or}} block rendering", () => {
    const monitor = buildMonitor();
    const aggregation = { value: 0, type: "" } as const;

    it("{{#and a b}} renders body only when both args are truthy", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const from = buildMonitor({ severity: "WARNING" });
      const to = buildMonitor({ severity: "ALERT" });
      const hit = renderer.render({
        template: "{{#and is_alert was_warning}}YES{{/and}}",
        from,
        to,
        aggregation,
      });
      expect(hit).toBe("YES");

      const miss = renderer.render({
        template: "{{#and is_alert was_warning}}YES{{/and}}",
        from: buildMonitor({ severity: "OK" }),
        to,
        aggregation,
      });
      expect(miss).toBe("");
    });

    it("{{#or a b}} renders body when either arg is truthy", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const to = buildMonitor({ severity: "WARNING" });
      const output = renderer.render({
        template: "{{#or is_alert is_warning}}DEGRADED{{/or}}",
        from: null,
        to,
        aggregation,
      });
      expect(output).toBe("DEGRADED");
    });

    it("renders the {{else}} inverse branch when the predicate is false", () => {
      const renderer = new MonitorTemplateRenderer({ baseUrl });
      const output = renderer.render({
        template: "{{#and is_alert is_warning}}HIT{{else}}MISS{{/and}}",
        from: null,
        to: monitor,
        aggregation,
      });
      expect(output).toBe("MISS");
    });
  });
});
