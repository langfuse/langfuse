import { describe, expect, it, vi } from "vitest";
import { prepareAnnotationQueueComplete } from "./prepareAnnotationQueueComplete";

describe("prepareAnnotationQueueComplete", () => {
  it("blurs the active score field before awaiting pending saves", async () => {
    let finishSave!: (saved: boolean) => void;
    const flushPendingEdits = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSave = resolve;
        }),
    );
    const complete = vi.fn();
    const input = document.createElement("input");
    input.type = "number";
    input.value = "5";
    document.body.append(input);
    input.focus();

    const blur = vi.fn();
    input.addEventListener("blur", blur);
    const completion = prepareAnnotationQueueComplete({
      flushPendingEdits,
    }).then((ready) => {
      if (ready) complete();
      return ready;
    });
    expect(blur).toHaveBeenCalledOnce();
    expect(flushPendingEdits).toHaveBeenCalledTimes(1);
    expect(blur.mock.invocationCallOrder[0]).toBeLessThan(
      flushPendingEdits.mock.invocationCallOrder[0]!,
    );
    expect(document.activeElement).not.toBe(input);
    expect(complete).not.toHaveBeenCalled();
    finishSave(true);
    await expect(completion).resolves.toBe(true);
    expect(complete).toHaveBeenCalledOnce();
    input.remove();
  });

  it("blocks completion after a failed save", async () => {
    await expect(
      prepareAnnotationQueueComplete({
        flushPendingEdits: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toBe(false);
  });

  it("blocks completion when a numeric score is out of range", async () => {
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

    await expect(
      prepareAnnotationQueueComplete({ flushPendingEdits }),
    ).resolves.toBe(false);

    expect(flushPendingEdits).not.toHaveBeenCalled();

    form.remove();
  });
});
