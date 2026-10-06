import { describe, expect, it, vi } from "vitest";
import { prepareAnnotationQueueComplete } from "./prepareAnnotationQueueComplete";

describe("prepareAnnotationQueueComplete", () => {
  it("flushes pending edits before blurring the active score field", () => {
    const flushPendingEdits = vi.fn();
    const input = document.createElement("input");
    input.type = "number";
    input.value = "5";
    document.body.append(input);
    input.focus();

    expect(
      prepareAnnotationQueueComplete({ flushPendingEdits }),
    ).toBe(true);

    expect(flushPendingEdits).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);

    input.remove();
  });

  it("blocks completion when a numeric score is out of range", () => {
    const flushPendingEdits = vi.fn();
    const form = document.createElement("div");
    form.setAttribute("data-annotation-form", "");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "1";
    input.value = "9";
    form.append(input);
    document.body.append(form);
    input.reportValidity();

    expect(
      prepareAnnotationQueueComplete({ flushPendingEdits }),
    ).toBe(false);

    expect(flushPendingEdits).not.toHaveBeenCalled();

    form.remove();
  });
});
