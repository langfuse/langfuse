import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TechnoSynth } from "./audio";
import { DmxOutput } from "./dmx";
import { ClubRuntime } from "./runtime";

const scene = vi.hoisted(() => ({
  construct: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("./scene", () => ({
  TowerScene: class {
    constructor() {
      scene.construct();
    }
    render = scene.render;
    dispose = scene.dispose;
  },
}));

function pendingResume() {
  let reject: (error: Error) => void = () => {};
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("club playback lifecycle", () => {
  let runtime: ClubRuntime;
  let playing: boolean;
  let audioTime: number;
  let detach: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    playing = false;
    audioTime = 0;
    scene.construct.mockReset();
    scene.render.mockReset();
    scene.dispose.mockReset();
    vi.spyOn(TechnoSynth.prototype, "resume").mockResolvedValue();
    vi.spyOn(TechnoSynth.prototype, "currentTime", "get").mockImplementation(
      () => audioTime,
    );
    vi.spyOn(DmxOutput.prototype, "connect").mockResolvedValue();
    runtime = new ClubRuntime(
      { duration: 10, observations: [], seed: 42, inscriptions: [] },
      {
        play: () => {
          playing = true;
        },
        pause: () => {
          playing = false;
        },
        stop: () => {
          playing = false;
        },
        seekToSec: () => {},
        setPlaybackDuration: () => {},
        getPlayheadSec: () => 0,
        getIsPlaying: () => playing,
        subscribePlayback: () => () => {},
      },
    );
  });

  afterEach(() => {
    detach?.();
    detach = undefined;
    runtime.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps a newer playback running when an obsolete start rejects", async () => {
    const pending = pendingResume();
    vi.mocked(TechnoSynth.prototype.resume).mockReturnValueOnce(
      pending.promise,
    );
    const firstStart = runtime.start();
    runtime.pause();
    await runtime.start();
    expect(playing).toBe(true);

    pending.reject(new Error("The earlier audio start was cancelled"));
    await firstStart;

    expect(playing).toBe(true);
    expect(runtime.state.getState().error).toBe("");
  });

  it("keeps a newer playback running when an obsolete clock recovery rejects", async () => {
    await runtime.start();
    const pending = pendingResume();
    vi.mocked(TechnoSynth.prototype.resume).mockReturnValueOnce(
      pending.promise,
    );
    audioTime = 1;
    vi.advanceTimersByTime(25);
    expect(TechnoSynth.prototype.resume).toHaveBeenCalledTimes(2);
    runtime.pause();
    await runtime.start();
    expect(playing).toBe(true);

    pending.reject(new Error("The earlier clock recovery was cancelled"));
    await Promise.resolve();

    expect(playing).toBe(true);
    expect(runtime.state.getState().error).toBe("");
  });

  it("cancels an audio start when graphics construction fails and requires a fresh scene", async () => {
    const pending = pendingResume();
    vi.mocked(TechnoSynth.prototype.resume).mockReturnValueOnce(
      pending.promise,
    );
    const starting = runtime.start();
    scene.construct.mockImplementationOnce(() => {
      throw new Error("WebGL unavailable");
    });
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");

    expect(runtime.attach(document.createElement("canvas"))).toBeUndefined();
    const error = runtime.state.getState().error;
    expect(error).toContain("WebGL 2 could not start");
    pending.resolve();
    await starting;
    expect(playing).toBe(false);
    expect(requestFrame).not.toHaveBeenCalled();

    await runtime.start();
    expect(playing).toBe(false);
    expect(TechnoSynth.prototype.resume).toHaveBeenCalledTimes(1);
    expect(runtime.state.getState().error).toBe(error);

    detach = runtime.attach(document.createElement("canvas"));
    await runtime.start();
    expect(playing).toBe(true);
  });

  it("stops animation, sound and lighting on context loss and removes its listener on detach", async () => {
    const canvas = document.createElement("canvas");
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const silence = vi.spyOn(TechnoSynth.prototype, "silence");
    const blackout = vi.spyOn(DmxOutput.prototype, "blackout");
    const pause = vi.spyOn(runtime.transport, "pause");
    detach = runtime.attach(canvas);
    await runtime.start();
    vi.advanceTimersByTime(17);
    expect(scene.render).toHaveBeenCalled();
    const lastFrameId = requestFrame.mock.results.at(-1)?.value;
    const rendered = scene.render.mock.calls.length;
    const lost = new Event("webglcontextlost", { cancelable: true });

    canvas.dispatchEvent(lost);

    expect(lost.defaultPrevented).toBe(true);
    expect(playing).toBe(false);
    expect(silence).toHaveBeenCalled();
    expect(blackout).toHaveBeenCalled();
    expect(cancelFrame).toHaveBeenCalledWith(lastFrameId);
    expect(runtime.state.getState().error).toContain("graphics context");
    vi.advanceTimersByTime(1000);
    expect(scene.render).toHaveBeenCalledTimes(rendered);

    detach?.();
    detach = undefined;
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    pause.mockClear();
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(pause).not.toHaveBeenCalled();
  });

  it("does not resume after context loss while an audio gesture is pending", async () => {
    const canvas = document.createElement("canvas");
    detach = runtime.attach(canvas);
    const pending = pendingResume();
    vi.mocked(TechnoSynth.prototype.resume).mockReturnValueOnce(
      pending.promise,
    );
    const starting = runtime.start();

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    const error = runtime.state.getState().error;
    pending.resolve();
    await starting;
    await runtime.start();

    expect(playing).toBe(false);
    expect(TechnoSynth.prototype.resume).toHaveBeenCalledTimes(1);
    expect(runtime.state.getState().error).toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the graphics recovery instruction when pending lighting connects", async () => {
    const canvas = document.createElement("canvas");
    detach = runtime.attach(canvas);
    const pending = pendingResume();
    vi.mocked(DmxOutput.prototype.connect).mockReturnValueOnce(pending.promise);
    await runtime.start();
    expect(runtime.state.getState().lights).toBe("connecting");

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    const error = runtime.state.getState().error;
    pending.resolve();
    await Promise.resolve();

    expect(runtime.state.getState().error).toBe(error);
    expect(playing).toBe(false);
  });

  it("allows the reopening Play gesture before the replacement canvas mounts", async () => {
    const canvas = document.createElement("canvas");
    detach = runtime.attach(canvas);
    await runtime.start();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    runtime.exit();
    detach?.();
    detach = undefined;

    const reopening = runtime.start();
    detach = runtime.attach(document.createElement("canvas"));
    await reopening;

    expect(playing).toBe(true);
    expect(runtime.state.getState().error).toBe("");
  });
});
