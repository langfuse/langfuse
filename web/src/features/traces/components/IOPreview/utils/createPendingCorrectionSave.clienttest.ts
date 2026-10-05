import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingCorrectionSave } from "./createPendingCorrectionSave";

describe("pending correction saves", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves only the latest edit at the debounce boundary", () => {
    const pending = createPendingCorrectionSave();
    const first = vi.fn();
    const latest = vi.fn();
    pending.schedule(first, 500);
    vi.advanceTimersByTime(200);
    pending.schedule(latest, 500);
    vi.advanceTimersByTime(499);
    expect(first).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(latest).toHaveBeenCalledOnce();
  });

  it("flushes the previous scope once without saving the next scope early", () => {
    const observation = createPendingCorrectionSave();
    const trace = createPendingCorrectionSave();
    const saveObservation = vi.fn();
    const saveTrace = vi.fn();
    observation.schedule(saveObservation, 500);
    trace.schedule(saveTrace, 500);
    observation.flush();
    expect(saveObservation).toHaveBeenCalledOnce();
    expect(saveTrace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(saveObservation).toHaveBeenCalledOnce();
    expect(saveTrace).toHaveBeenCalledOnce();
  });

  it("cancels a pending save before deletion or an invalid edit", () => {
    const pending = createPendingCorrectionSave();
    const save = vi.fn();
    pending.schedule(save, 500);
    pending.cancel();
    pending.flush();
    vi.advanceTimersByTime(500);
    expect(save).not.toHaveBeenCalled();
  });

  it("retains the original record callback after the caller leaves", () => {
    const save = vi.fn();
    createPendingCorrectionSave().schedule(
      () => save("observation", "edit"),
      500,
    );
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledExactlyOnceWith("observation", "edit");
  });
});
