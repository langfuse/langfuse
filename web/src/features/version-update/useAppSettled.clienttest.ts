import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAppSettledGate } from "./useAppSettled";

describe("createAppSettledGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts unsettled and settles after the delay once subscribed", () => {
    const gate = createAppSettledGate(5000);
    expect(gate.getSnapshot()).toBe(false);

    const listener = vi.fn();
    gate.subscribe(listener);
    expect(gate.getSnapshot()).toBe(false);

    vi.advanceTimersByTime(4999);
    expect(gate.getSnapshot()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(gate.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not start the timer until the first subscription", () => {
    const gate = createAppSettledGate(5000);
    // No subscriber yet → timer never started, so time passing does nothing.
    vi.advanceTimersByTime(10000);
    expect(gate.getSnapshot()).toBe(false);

    gate.subscribe(vi.fn());
    vi.advanceTimersByTime(5000);
    expect(gate.getSnapshot()).toBe(true);
  });

  it("starts the timer once across subscribe/unsubscribe/resubscribe (StrictMode) and remounts", () => {
    const gate = createAppSettledGate(5000);

    // StrictMode mounts, unmounts, remounts synchronously before the timer.
    const unsub = gate.subscribe(vi.fn());
    unsub();
    gate.subscribe(vi.fn());

    vi.advanceTimersByTime(5000);
    expect(gate.getSnapshot()).toBe(true);
  });

  it("reports settled immediately to a subscriber that mounts after settling (remount survives)", () => {
    const gate = createAppSettledGate(5000);
    const first = gate.subscribe(vi.fn());
    vi.advanceTimersByTime(5000);
    expect(gate.getSnapshot()).toBe(true);

    // The component unmounts (e.g. AuthenticatedLayout -> MinimalLayout) and a
    // fresh one mounts later — it must see the already-settled value, not reset.
    first();
    const listener = vi.fn();
    gate.subscribe(listener);
    expect(gate.getSnapshot()).toBe(true);
    // Already settled → no further timer, no extra notification needed.
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
  });

  it("has a server snapshot that is always false", () => {
    const gate = createAppSettledGate(5000);
    gate.subscribe(vi.fn());
    vi.advanceTimersByTime(5000);
    expect(gate.getSnapshot()).toBe(true);
    expect(gate.getServerSnapshot()).toBe(false);
  });
});
