import { describe, it, expect } from "vitest";

import { isValidTemplate } from "./isValidTemplate";

describe("isValidTemplate", () => {
  it("accepts the empty string", () => {
    expect(isValidTemplate("")).toBe(true);
  });

  it("accepts plain text without any handlebars", () => {
    expect(isValidTemplate("hello world")).toBe(true);
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
    expect(isValidTemplate(`x {{${key}}} y`)).toBe(true);
  });

  it("accepts a mix of text and multiple variables", () => {
    expect(
      isValidTemplate("Alert {{value}} crossed {{threshold}} in {{window}}"),
    ).toBe(true);
  });

  it("accepts a handlebars comment", () => {
    expect(isValidTemplate("{{! a comment }}hi {{value}}")).toBe(true);
  });

  it("rejects a template referencing an unknown variable", () => {
    expect(isValidTemplate("{{foo}}")).toBe(false);
  });

  it("rejects unescaped {{{value}}}", () => {
    expect(isValidTemplate("{{{value}}}")).toBe(false);
  });

  it.each([
    "{{#if is_alert}}x{{/if}}",
    "{{#unless is_ok}}x{{/unless}}",
    "{{#each tags}}x{{/each}}",
    "{{#with value}}x{{/with}}",
  ])("rejects a block helper: %s", (template) => {
    expect(isValidTemplate(template)).toBe(false);
  });

  it("rejects an inline helper invocation", () => {
    expect(isValidTemplate("{{lookup tags 0}}")).toBe(false);
  });

  it("rejects a partial", () => {
    expect(isValidTemplate("{{> myPartial}}")).toBe(false);
  });

  it("rejects a sub-expression argument", () => {
    expect(isValidTemplate("{{value (lookup tags 0)}}")).toBe(false);
  });

  it("rejects malformed handlebars", () => {
    expect(isValidTemplate("{{value")).toBe(false);
  });

  it.each(["{{@is_alert}}", "{{@value}}", "{{@threshold}}", "{{@root}}"])(
    "rejects an @-prefixed data reference: %s",
    (template) => {
      expect(isValidTemplate(template)).toBe(false);
    },
  );

  it.each(["{{../value}}", "{{../is_alert}}"])(
    "rejects a parent-context reference: %s",
    (template) => {
      expect(isValidTemplate(template)).toBe(false);
    },
  );

  it.each(["{{tags.0}}", "{{value.length}}", "{{window.constructor}}"])(
    "rejects a sub-property reference: %s",
    (template) => {
      expect(isValidTemplate(template)).toBe(false);
    },
  );
});
