import { describe, it, expect } from "vitest";

import { validateMonitorTemplate } from "./template";

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
    "warningThreshold",
    "operator",
    "window",
    "permalink",
    "tags",
    "is_ok",
    "is_warning",
    "is_alert",
    "is_no_data",
    "is_fired",
    "is_resolved",
    "is_crossed",
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
    "{{#each tags}}x{{/each}}",
    "{{#with value}}x{{/with}}",
  ])("rejects a block helper: %s", (template) => {
    expect(validateMonitorTemplate(template)).toBe(false);
  });

  it("rejects an inline helper invocation", () => {
    expect(validateMonitorTemplate("{{lookup tags 0}}")).toBe(false);
  });

  it("rejects a partial", () => {
    expect(validateMonitorTemplate("{{> myPartial}}")).toBe(false);
  });

  it("rejects a sub-expression argument", () => {
    expect(validateMonitorTemplate("{{value (lookup tags 0)}}")).toBe(false);
  });

  it("rejects malformed handlebars", () => {
    expect(validateMonitorTemplate("{{value")).toBe(false);
  });
});
