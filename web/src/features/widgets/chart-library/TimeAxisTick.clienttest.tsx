import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { XAxisTickContentProps } from "recharts";
import { timeAxisTick } from "./TimeAxisTick";

const Tick = timeAxisTick((value) => `Aug ${value}`, "2");

const tickPayload = (index: number, coordinate: number) => ({
  coordinate,
  value: String(index),
  index,
  offset: 0,
});

function renderTick(props: {
  x: number;
  y: number;
  index: number;
  visibleTicksCount: number;
  payload: ReturnType<typeof tickPayload>;
}) {
  return renderToStaticMarkup(
    <svg>
      <Tick {...(props as XAxisTickContentProps)} />
    </svg>,
  );
}

describe("TimeAxisTick", () => {
  it("end-anchors the last data bucket so the date stays on-canvas", () => {
    const html = renderTick({
      x: 400,
      y: 0,
      index: 2,
      payload: tickPayload(2, 400),
      visibleTicksCount: 3,
    });

    expect(html).toContain('text-anchor="end"');
    expect(html).toContain("Aug 2");
  });

  it("keeps earlier ticks centered", () => {
    const html = renderTick({
      x: 200,
      y: 0,
      index: 1,
      payload: tickPayload(1, 200),
      visibleTicksCount: 3,
    });

    expect(html).toContain('text-anchor="middle"');
    expect(html).toContain("Aug 1");
  });

  it("keeps a thinned last-rendered tick centered when it is not the last bucket", () => {
    const html = renderTick({
      x: 320,
      y: 0,
      index: 5,
      payload: tickPayload(20, 320),
      visibleTicksCount: 6,
    });

    expect(html).toContain('text-anchor="middle"');
    expect(html).toContain("Aug 20");
  });
});
