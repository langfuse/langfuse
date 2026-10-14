import { describe, expect, it } from "vitest";
import {
  buildCustomUiStageSpec,
  compileCustomUiRenderPlan,
} from "./compileRenderPlan";
import {
  CUSTOM_UI_SPEC_LIMITS,
  validateCustomUiSpec,
  type CustomUiRenderInput,
  type CustomUiSpec,
} from "./spec";

const input = (data: Record<string, unknown> = {}): CustomUiRenderInput => ({
  envelopeVersion: "1",
  data,
  meta: { surface: "SESSION", source: "OBSERVATION_OUTPUT" },
  scores: [],
});

const textElement = (content: unknown) => ({
  type: "Text" as const,
  props: { content, variant: "body", maxLines: null },
  children: [],
});

const stackElement = (children: string[]) => ({
  type: "Stack" as const,
  props: { gap: "md" },
  children,
});

describe("Custom UI render-plan compiler", () => {
  it("accepts only allowlisted, read-only dynamic expressions", () => {
    const allowed: CustomUiSpec = {
      root: "root",
      elements: {
        root: stackElement(["state", "computed"]),
        state: {
          ...textElement({ $state: "/data/summary" }),
          visible: { $state: "/data/summary", not: true },
        },
        computed: textElement({
          $computed: "truncate",
          args: { value: { $state: "/data/summary" }, maximum: 120 },
        }),
      },
    };
    expect(validateCustomUiSpec(allowed).success).toBe(true);

    const writable = structuredClone(allowed);
    writable.elements.state!.props.content = { $bindState: "/data/summary" };
    expect(validateCustomUiSpec(writable)).toEqual({
      success: false,
      code: "DISALLOWED_EXPRESSION",
    });

    const unknownFunction = structuredClone(allowed);
    unknownFunction.elements.computed!.props.content = {
      $computed: "fetch",
      args: {},
    };
    expect(validateCustomUiSpec(unknownFunction)).toEqual({
      success: false,
      code: "DISALLOWED_EXPRESSION",
    });
  });

  it("rejects cyclic, orphaned, excessive, and oversized render graphs", () => {
    const cyclic: CustomUiSpec = {
      root: "a",
      elements: {
        a: stackElement(["b"]),
        b: stackElement(["a"]),
      },
    };
    expect(compileCustomUiRenderPlan(cyclic, input())).toEqual({
      success: false,
      code: "INVALID_STRUCTURE",
    });

    const orphaned: CustomUiSpec = {
      root: "root",
      elements: {
        root: textElement("visible"),
        orphan: textElement("not referenced"),
      },
    };
    expect(compileCustomUiRenderPlan(orphaned, input())).toEqual({
      success: false,
      code: "INVALID_STRUCTURE",
    });

    const excessive: CustomUiSpec = {
      root: "root",
      elements: {
        root: stackElement(
          Array.from(
            { length: CUSTOM_UI_SPEC_LIMITS.maxNodes },
            (_, index) => `node-${index}`,
          ),
        ),
        ...Object.fromEntries(
          Array.from({ length: CUSTOM_UI_SPEC_LIMITS.maxNodes }, (_, index) => [
            `node-${index}`,
            textElement("value"),
          ]),
        ),
      },
    };
    expect(compileCustomUiRenderPlan(excessive, input())).toEqual({
      success: false,
      code: "TOO_MANY_NODES",
    });

    const oversized = {
      root: "root",
      elements: {
        root: textElement("x".repeat(CUSTOM_UI_SPEC_LIMITS.maxBytes)),
      },
    };
    expect(validateCustomUiSpec(oversized)).toEqual({
      success: false,
      code: "TOO_LARGE",
    });
  });

  it("bounds repeated data without mutating the source envelope", () => {
    const spec: CustomUiSpec = {
      root: "root",
      elements: {
        root: {
          ...stackElement(["row"]),
          repeat: { statePath: "/data/items", key: "id" },
        },
        row: textElement({ $item: "label" }),
      },
    };
    const source = input({
      items: Array.from({ length: 105 }, (_, index) => ({
        id: index,
        label: `item ${index}`,
      })),
    });
    const result = compileCustomUiRenderPlan(spec, source);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(source.data.items).toHaveLength(105);
    expect(result.plan.input.data.items).toHaveLength(100);
    expect(result.plan.diagnostics).toMatchObject({
      repeatRegionCount: 1,
      boundedRepeatItemCount: 100,
      truncatedRepeatItemCount: 5,
    });
  });

  it("keeps every progressive stage structurally renderable", () => {
    const spec: CustomUiSpec = {
      root: "root",
      elements: {
        root: stackElement(["grid"]),
        grid: {
          type: "Grid",
          props: { columns: 2 },
          children: ["cheap", "heavy"],
        },
        cheap: textElement("Summary"),
        heavy: {
          type: "Json",
          props: { label: "Details", value: { ok: true }, collapsed: false },
          children: [],
        },
      },
    };
    const result = compileCustomUiRenderPlan(spec, input());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const initial = buildCustomUiStageSpec(result.plan, 0);
    expect(initial.root).toBe("root");
    expect(initial.elements.root?.children).toEqual([]);
    expect(initial.elements.grid).toBeUndefined();

    const complete = buildCustomUiStageSpec(result.plan, 1);
    expect(Object.keys(complete.elements)).toEqual([
      "root",
      "grid",
      "cheap",
      "heavy",
    ]);
    expect(result.plan.diagnostics).toMatchObject({
      nodeCount: 4,
      maxDepth: 2,
      deferredCount: 3,
    });
  });

  it("forces secondary deep disclosure closed", () => {
    const spec: CustomUiSpec = {
      root: "root",
      elements: {
        root: stackElement(["first"]),
        first: stackElement(["second"]),
        second: stackElement(["accordion", "json"]),
        accordion: {
          type: "Accordion",
          props: { title: "More", defaultOpen: true },
          children: [],
        },
        json: {
          type: "Json",
          props: { label: "Payload", value: {}, collapsed: false },
          children: [],
        },
      },
    };
    const result = compileCustomUiRenderPlan(spec, input());
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.plan.spec.elements.accordion?.props.defaultOpen).toBe(false);
    expect(result.plan.spec.elements.json?.props.collapsed).toBe(true);
  });
});
