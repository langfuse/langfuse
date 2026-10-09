import { userEvent as storybookUserEvent } from "storybook/test";

/** Keeps the native browser pointer aligned with synthetic Storybook interactions. */
export async function hoverChartTarget(
  target: Element,
  pointerTarget?: Element,
): Promise<void> {
  if ("__vitest_browser__" in globalThis) {
    const { userEvent: browserUserEvent } = await import("vitest/browser");
    await browserUserEvent.hover(
      pointerTarget ?? target,
      pointerTarget ? { force: true } : undefined,
    );
    if (!pointerTarget) return;
  }

  // Covered SVG hit areas need chart geometry for the real pointer while
  // Storybook dispatches the hover to the chart's semantic interaction area.
  await storybookUserEvent.hover(target);
}

export async function hoverChartTargetAt(
  target: Element,
  position: PointerPosition,
): Promise<void> {
  if ("__vitest_browser__" in globalThis) {
    const { userEvent: browserUserEvent } = await import("vitest/browser");
    await browserUserEvent.hover(target, { position });
    return;
  }

  await storybookUserEvent.hover(target);
}

export async function movePointerOffChart(target: Element): Promise<void> {
  if ("__vitest_browser__" in globalThis) {
    const { userEvent: browserUserEvent } = await import("vitest/browser");
    await browserUserEvent.unhover(target, {
      force: true,
      position: { x: 1, y: 1 },
    });
  }
}

type PointerPosition = {
  x: number;
  y: number;
};
