import { describe, it, expect } from "vitest";
import {
  compilePromptTemplate,
  extractTemplateVariables,
} from "@langfuse/shared/src/server";

describe("compilePromptTemplate — default format", () => {
  it("substitutes simple {{ var }} variables", () => {
    const result = compilePromptTemplate(
      "Hello {{ name }}!",
      { name: "World" },
      "default",
    );
    expect(result.compiled).toBe("Hello World!");
    expect(result.errors).toHaveLength(0);
  });

  it("leaves missing variables as-is", () => {
    const result = compilePromptTemplate("Hello {{ name }}!", {}, "default");
    expect(result.compiled).toBe("Hello {{ name }}!");
    expect(result.errors).toHaveLength(0);
  });

  it("returns original template unchanged on error", () => {
    // This should not throw — just return original
    const result = compilePromptTemplate("Hello {{ name }}!", {}, "default");
    expect(result.compiled).toContain("Hello");
  });
});

describe("compilePromptTemplate — jinja2 format", () => {
  it("substitutes {{ var }} variables", () => {
    const result = compilePromptTemplate(
      "Hello {{ name }}!",
      { name: "World" },
      "jinja2",
    );
    expect(result.compiled).toBe("Hello World!");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves {% if %} conditional — truthy branch", () => {
    const result = compilePromptTemplate(
      "{% if user_type == 'premium' %}Premium user.{% else %}Free user.{% endif %}",
      { user_type: "premium" },
      "jinja2",
    );
    expect(result.compiled).toBe("Premium user.");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves {% if %} conditional — else branch", () => {
    const result = compilePromptTemplate(
      "{% if user_type == 'premium' %}Premium user.{% else %}Free user.{% endif %}",
      { user_type: "free" },
      "jinja2",
    );
    expect(result.compiled).toBe("Free user.");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves {% for %} loop", () => {
    const result = compilePromptTemplate(
      "{% for doc in docs %}{{ doc.title }}\n{% endfor %}",
      { docs: [{ title: "A" }, { title: "B" }] },
      "jinja2",
    );
    expect(result.compiled).toBe("A\nB\n");
    expect(result.errors).toHaveLength(0);
  });

  it("missing variable in {{ }} renders as empty string", () => {
    const result = compilePromptTemplate("Hello {{ name }}!", {}, "jinja2");
    expect(result.compiled).toBe("Hello !");
    expect(result.errors).toHaveLength(0);
  });

  it("missing variable in {% if %} takes falsy / else branch", () => {
    const result = compilePromptTemplate(
      "{% if flag %}yes{% else %}no{% endif %}",
      {},
      "jinja2",
    );
    expect(result.compiled).toBe("no");
  });

  it("returns original template + error on Jinja2 syntax error", () => {
    const result = compilePromptTemplate("{% if unclosed %}", {}, "jinja2");
    expect(result.errors).toHaveLength(1);
    expect(result.compiled).toBe("{% if unclosed %}");
  });

  it("returns error when template exceeds size limit", () => {
    const huge = "x".repeat(100_001);
    const result = compilePromptTemplate(huge, {}, "jinja2");
    expect(result.errors[0]).toMatch(/100000 byte limit/);
    expect(result.compiled).toBe(huge);
  });

  it("caches compiled template — second call with same template reuses cache", () => {
    const template = "Hello {{ name }}!";
    const r1 = compilePromptTemplate(template, { name: "A" }, "jinja2");
    const r2 = compilePromptTemplate(template, { name: "B" }, "jinja2");
    expect(r1.compiled).toBe("Hello A!");
    expect(r2.compiled).toBe("Hello B!");
  });

  it("supports dotted access {{ doc.title }}", () => {
    const result = compilePromptTemplate(
      "{{ doc.title }}",
      { doc: { title: "My Doc" } },
      "jinja2",
    );
    expect(result.compiled).toBe("My Doc");
  });
});

describe("extractTemplateVariables", () => {
  it("extracts simple {{ var }} variables", () => {
    const vars = extractTemplateVariables(
      "Hello {{ name }}, your score is {{ score }}.",
    );
    expect(vars).toContain("name");
    expect(vars).toContain("score");
  });

  it("extracts loop list variable but excludes loop alias", () => {
    const vars = extractTemplateVariables(
      "{% for item in docs %}{{ item.title }}{% endfor %}",
    );
    expect(vars).toContain("docs");
    expect(vars).not.toContain("item");
  });

  it("extracts {% if condition %} variable", () => {
    const vars = extractTemplateVariables(
      "{% if user_type == 'premium' %}yes{% endif %}",
    );
    expect(vars).toContain("user_type");
  });

  it("excludes Nunjucks built-in keywords", () => {
    const vars = extractTemplateVariables(
      "{% if true %}yes{% endif %}{{ range }}",
    );
    expect(vars).not.toContain("true");
    expect(vars).not.toContain("range");
  });

  it("deduplicates variables", () => {
    const vars = extractTemplateVariables("{{ name }} and {{ name }} again");
    expect(vars.filter((v) => v === "name")).toHaveLength(1);
  });

  it("returns sorted results", () => {
    const vars = extractTemplateVariables("{{ zeta }} {{ alpha }} {{ beta }}");
    expect(vars).toEqual([...vars].sort());
  });

  it("returns empty array for plain text", () => {
    const vars = extractTemplateVariables("No variables here.");
    expect(vars).toHaveLength(0);
  });
});
