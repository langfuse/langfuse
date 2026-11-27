// @vitest-environment node
import { createAnnotationAnalytics } from "./annotationAnalytics";

describe("annotation analytics", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const context = {
    type: "trace" as const,
    source: "AnnotationQueue" as const,
    targetType: "observation" as const,
    isV4: true,
  };
  const field = {
    id: null,
    configId: "private-config-id",
    name: "private-config-name",
    dataType: "TEXT" as const,
    stringValue: null,
  };

  it("counts one visible form across effect replay and abandons only on close", () => {
    const capture = vi.fn();
    const analytics = createAnnotationAnalytics(capture, context, [field]);
    analytics.open();
    analytics.close();
    analytics.open();
    vi.runAllTimers();
    expect(capture.mock.calls.map(([event]) => event)).toEqual([
      "score:create_form_open",
    ]);
    analytics.close();
    vi.runAllTimers();
    expect(capture.mock.calls.at(-1)).toEqual([
      "score:form_abandoned",
      expect.objectContaining({
        ...context,
        fieldCount: 1,
        filledFieldCount: 0,
      }),
    ]);
  });

  it("deduplicates unchanged values, waits for saves after close, and emits metadata only", () => {
    const capture = vi.fn();
    const analytics = createAnnotationAnalytics(capture, context, [field]);
    analytics.open();
    const saved = {
      ...field,
      id: "private-score-id",
      stringValue: "private-text",
      comment: "private-comment",
    };
    const save = analytics.beginSave("create", saved, [saved], {
      control: "text",
      optionCount: 0,
    });
    const duplicate = analytics.beginSave("update", saved, [saved], {
      control: "text",
      optionCount: 0,
    });
    analytics.close();
    vi.runAllTimers();
    expect(capture.mock.calls.map(([event]) => event)).toEqual([
      "score:create_form_open",
      "score:value_set",
    ]);
    save?.success();
    duplicate?.success();
    expect(capture.mock.calls.map(([event]) => event)).toEqual([
      "score:create_form_open",
      "score:value_set",
      "score:create",
    ]);
    expect(capture.mock.calls.at(-1)?.[1]).toEqual({
      ...context,
      dataType: "TEXT",
      fieldCount: 1,
      filledFieldCount: 1,
      hasComment: true,
    });
    expect(JSON.stringify(capture.mock.calls)).not.toContain("private-");
  });

  it("does not report failed saves, permits retry, and marks corrections", () => {
    const capture = vi.fn();
    const existing = { ...field, id: "private-score-id", stringValue: "old" };
    const analytics = createAnnotationAnalytics(capture, context, [existing]);
    analytics.open();
    const changed = { ...existing, stringValue: "new" };
    const failed = analytics.beginSave("update", changed, [changed], {
      control: "text",
      optionCount: 0,
    });
    failed?.failure();
    expect(capture).not.toHaveBeenCalledWith("score:update", expect.anything());
    expect(capture).toHaveBeenCalledWith(
      "score:value_set",
      expect.objectContaining({ isCorrection: true }),
    );
    const retry = analytics.beginSave("update", changed, [changed], {
      control: "text",
      optionCount: 0,
    });
    expect(retry).toBeDefined();
    retry?.success();
    analytics.close();
    vi.runAllTimers();
    expect(
      capture.mock.calls.filter(([event]) => event === "score:update"),
    ).toHaveLength(1);
    expect(
      capture.mock.calls.filter(([event]) => event === "score:form_abandoned"),
    ).toHaveLength(0);
  });

  it("permits retry after overlapping updates both fail", () => {
    const capture = vi.fn();
    const existing = { ...field, id: "private-score-id", stringValue: "old" };
    const analytics = createAnnotationAnalytics(capture, context, [existing]);
    analytics.open();
    const firstValue = { ...existing, stringValue: "first" };
    const secondValue = { ...existing, stringValue: "second" };
    const first = analytics.beginSave("update", firstValue, [firstValue]);
    const second = analytics.beginSave("update", secondValue, [secondValue]);
    first?.failure();
    second?.failure();

    const retry = analytics.beginSave("update", firstValue, [firstValue]);
    expect(retry).toBeDefined();
    retry?.success();
    expect(
      capture.mock.calls.filter(([event]) => event === "score:update"),
    ).toHaveLength(1);
  });
});
