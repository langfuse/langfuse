import {
  createStageCamera,
  stageFrameAt,
  type StageRect,
} from "@/src/features/in-app-agent/stage/motion/stageCamera";
import {
  cubicBezier,
  easeStageClose,
  easeStageOpen,
} from "@/src/features/in-app-agent/stage/motion/cubicBezier";

const viewport = { width: 1440, height: 900 };
const slot: StageRect = { x: 960, y: 520, width: 288, height: 180 };

function parseChatTransform(transform: string) {
  const match =
    /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(
      transform,
    );
  if (!match) {
    throw new Error(`Unexpected transform ${transform}`);
  }
  return {
    tx: Number(match[1]),
    ty: Number(match[2]),
    scale: Number(match[3]),
  };
}

function expectRectClose(actual: StageRect, expected: StageRect) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe("stage camera", () => {
  const camera = createStageCamera(viewport, slot);
  if (!camera) {
    throw new Error("expected a camera");
  }

  it("starts as an exact overlay of the live page with every effect off", () => {
    const frame = stageFrameAt(camera, 0, 10);

    expectRectClose(frame.rect, { x: 0, y: 0, ...viewport });
    expect(frame).toMatchObject({
      radius: 0,
      tilt: 0,
      blur: 0,
      dim: 0,
      shadow: 0,
      chatOpacity: 0,
    });
  });

  it("lands exactly on the slot with the chat at rest", () => {
    const frame = stageFrameAt(camera, 1, 10);

    expectRectClose(frame.rect, slot);
    expect(frame.radius).toBeCloseTo(10, 6);
    expect(frame.tilt).toBeCloseTo(0, 6);
    expect(frame.shadow).toBeCloseTo(0, 6);
    expect(frame.chatOpacity).toBe(1);
    const chat = parseChatTransform(frame.chatTransform);
    expect(chat.scale).toBeCloseTo(1, 6);
    expect(chat.tx).toBeCloseTo(0, 6);
    expect(chat.ty).toBeCloseTo(0, 6);
  });

  it.each([0.1, 0.35, 0.5, 0.8])(
    "keeps the chat's slot glued to the page texture at progress %s",
    (progress) => {
      const frame = stageFrameAt(camera, progress, 10);
      const chat = parseChatTransform(frame.chatTransform);

      expectRectClose(frame.rect, {
        x: chat.tx + chat.scale * slot.x,
        y: chat.ty + chat.scale * slot.y,
        width: chat.scale * slot.width,
        height: chat.scale * slot.height,
      });
    },
  );

  it("zooms at a constant perceptual rate", () => {
    const quarter = stageFrameAt(camera, 0.25, 0).rect.width;
    const half = stageFrameAt(camera, 0.5, 0).rect.width;
    const threeQuarters = stageFrameAt(camera, 0.75, 0).rect.width;

    expect(half / quarter).toBeCloseTo(threeQuarters / half, 6);
  });

  it("refuses slots it cannot fly into", () => {
    expect(
      createStageCamera(viewport, { x: 0, y: 0, width: 1440, height: 900 }),
    ).toBeNull();
    expect(
      createStageCamera(viewport, { x: 10, y: 10, width: 4, height: 3 }),
    ).toBeNull();
    expect(createStageCamera({ width: 0, height: 0 }, slot)).toBeNull();
  });
});

describe("cubicBezier", () => {
  it("matches the linear curve when control points are on the diagonal", () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const t of [0, 0.2, 0.5, 0.9, 1]) {
      expect(linear(t)).toBeCloseTo(t, 4);
    }
  });

  it.each([
    ["open", easeStageOpen],
    ["close", easeStageClose],
  ])("keeps the %s curve monotonic and pinned at both ends", (_name, ease) => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = ease(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });
});
