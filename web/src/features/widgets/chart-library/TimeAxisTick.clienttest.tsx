import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { timeAxisTick } from "./TimeAxisTick";

const Tick = timeAxisTick((value) => `Aug ${value}`);

const tickPayload = (index: number, coordinate: number) => ({
  coordinate,
  value: String(index),
  index,
  offset: 0,
});

describe("TimeAxisTick", () => {
  it("end-anchors the last visible tick so the date stays on-canvas", () => {
    const html = renderToStaticMarkup(
      <svg>
        <Tick
          x={400}
          y={0}
          payload={tickPayload(2, 400)}
          visibleTicksCount={3}
        />
      </svg>,
    );

    expect(html).toContain('text-anchor="end"');
    expect(html).toContain("Aug 2");
  });

  it("keeps earlier ticks centered", () => {
    const html = renderToStaticMarkup(
      <svg>
        <Tick
          x={200}
          y={0}
          payload={tickPayload(1, 200)}
          visibleTicksCount={3}
        />
      </svg>,
    );

    expect(html).toContain('text-anchor="middle"');
    expect(html).toContain("Aug 1");
  });
});
