import {
  CAPTURE_LIMITS,
  resolveCaptureScale,
} from "@/src/features/in-app-agent/stage/capture/resolveCaptureScale";

const base = {
  maxTextureSize: 16384,
  isHandheld: false,
};

describe("resolveCaptureScale", () => {
  it("captures at the device pixel ratio when the budget allows it", () => {
    expect(
      resolveCaptureScale({
        ...base,
        cssWidth: 1440,
        cssHeight: 900,
        devicePixelRatio: 2,
      }),
    ).toBe(2);
  });

  it("caps high-density phones at 2x", () => {
    expect(
      resolveCaptureScale({
        cssWidth: 390,
        cssHeight: 844,
        devicePixelRatio: 3,
        maxTextureSize: 4096,
        isHandheld: true,
      }),
    ).toBe(2);
  });

  it("stays inside the desktop pixel budget on large retina screens", () => {
    const scale = resolveCaptureScale({
      ...base,
      cssWidth: 2560,
      cssHeight: 1440,
      devicePixelRatio: 2,
    });

    expect(2560 * scale * 1440 * scale).toBeLessThanOrEqual(
      CAPTURE_LIMITS.desktop.maxPixels,
    );
    expect(scale).toBeGreaterThan(1);
  });

  it("never exceeds the GPU's maximum texture size", () => {
    const scale = resolveCaptureScale({
      cssWidth: 1024,
      cssHeight: 1366,
      devicePixelRatio: 2,
      maxTextureSize: 2048,
      isHandheld: true,
    });

    expect(1366 * scale).toBeLessThanOrEqual(2048);
  });

  it("keeps a floor so very large viewports still capture legibly", () => {
    expect(
      resolveCaptureScale({
        ...base,
        cssWidth: 8000,
        cssHeight: 6000,
        devicePixelRatio: 1,
      }),
    ).toBe(CAPTURE_LIMITS.minScale);
  });

  it("treats an unknown pixel ratio as 1x and an empty viewport as a no-op", () => {
    expect(
      resolveCaptureScale({
        ...base,
        cssWidth: 1280,
        cssHeight: 800,
        devicePixelRatio: 0,
      }),
    ).toBe(1);
    expect(
      resolveCaptureScale({
        ...base,
        cssWidth: 0,
        cssHeight: 800,
        devicePixelRatio: 2,
      }),
    ).toBe(1);
  });
});
