import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import {
  mockGlimmProviderProps,
  resetMockGlimm,
  setMockGlimmSweep,
} from "./__mocks__/glimmReact";
import {
  SpielwieseRouteTransitionProvider,
  useSpielwieseRouteTransition,
} from "./spielwieseRouteTransition";

let mockResolveDone: (() => void) | undefined;

const mockSweep = jest.fn((navigate: () => Promise<unknown> | void) => {
  const midpoint = Promise.resolve().then(async () => {
    await navigate();
  });
  const done = new Promise<void>((resolve) => {
    mockResolveDone = resolve;
  });

  return {
    midpoint,
    done,
    cancel: jest.fn(),
  };
});

function TransitionProbe({
  label,
  onNavigate,
}: {
  label: string;
  onNavigate: () => void;
}) {
  const routeTransition = useSpielwieseRouteTransition();

  return (
    <button
      data-active={routeTransition.isActive ? "true" : "false"}
      onClick={() => routeTransition.start(onNavigate)}
      type="button"
    >
      {label}
    </button>
  );
}

function TransitionHarness({ onNavigate }: { onNavigate: () => void }) {
  const [label, setLabel] = useState("Start transition");

  return (
    <TransitionProbe
      label={label}
      onNavigate={() => {
        onNavigate();
        setLabel("Dashboard");
      }}
    />
  );
}

function getLiveLayerPhase() {
  return screen
    .getByTestId("spielwiese-route-transition-live")
    .getAttribute("data-route-transition-phase");
}

function expectSubtleNeutralGlimmDefaults() {
  const glimmProps = mockGlimmProviderProps[mockGlimmProviderProps.length - 1];

  expect(glimmProps).toMatchObject({
    bandTight: 10,
    brightness: 0.64,
    direction: "ltr",
    easing: "easeInOutCubic",
    midpoint: 0.5,
    outroMs: 260,
    peakAlpha: 0.3,
    rippleAmount: 0.04,
    sweepMs: 900,
    swellAmount: 0.14,
    waveAmount: 0.1,
    waveSpeed: 0.35,
    zIndex: 9998,
  });
  expect(glimmProps?.palette).toEqual({
    a: [0.86, 0.9, 0.94],
    b: [0.13, 0.12, 0.11],
    c: [0.46, 0.46, 0.46],
    d: [0.62, 0.59, 0.55],
  });
}

function expectRouteSnapshotCopy() {
  const routeSnapshot = screen.getByTestId(
    "spielwiese-route-transition-snapshot",
  );

  expect(within(routeSnapshot).getByText("Start transition").textContent).toBe(
    "Start transition",
  );
}

describe("SpielwieseRouteTransitionProvider", () => {
  beforeEach(() => {
    resetMockGlimm();
    setMockGlimmSweep(mockSweep);
    mockResolveDone = undefined;
    mockSweep.mockClear();
  });

  it("configures a subtle neutral left-to-right Glimm sweep", () => {
    render(
      <SpielwieseRouteTransitionProvider>
        <TransitionProbe label="Start transition" onNavigate={jest.fn()} />
      </SpielwieseRouteTransitionProvider>,
    );

    expectSubtleNeutralGlimmDefaults();
  });

  it("delegates navigation to Glimm and stays active until the sweep completes", async () => {
    const onNavigate = jest.fn();

    render(
      <SpielwieseRouteTransitionProvider>
        <TransitionHarness onNavigate={onNavigate} />
      </SpielwieseRouteTransitionProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Start transition" });

    fireEvent.click(trigger);

    expect(mockSweep).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("data-active")).toBe("true");
    expect(getLiveLayerPhase()).toBe("sweeping");
    expectRouteSnapshotCopy();
    expect(onNavigate).not.toHaveBeenCalled();

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));

    expect(trigger.getAttribute("data-active")).toBe("true");
    expect(getLiveLayerPhase()).toBe("revealing");
    expect(
      screen.getByTestId("spielwiese-route-transition-snapshot"),
    ).toBeTruthy();

    mockResolveDone?.();

    await waitFor(() =>
      expect(trigger.getAttribute("data-active")).toBe("false"),
    );
    expect(getLiveLayerPhase()).toBe("idle");
    expect(
      screen.queryByTestId("spielwiese-route-transition-snapshot"),
    ).toBeNull();
  });
});
