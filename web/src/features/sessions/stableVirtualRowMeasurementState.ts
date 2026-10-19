export type StableVirtualRowMeasurementConfig = {
  scrollIdleMs: number;
  oscillationWindowMs: number;
  maxOscillationCount: number;
};

export const STABLE_VIRTUAL_ROW_MEASUREMENT_CONFIG: StableVirtualRowMeasurementConfig =
  {
    scrollIdleMs: 150,
    oscillationWindowMs: 1_000,
    maxOscillationCount: 4,
  };

type OscillationPair = [number, number];

type StableVirtualRowMeasurementState = {
  committedHeight: number | null;
  pendingHeight: number | null;
  previousObservedHeight: number | null;
  oscillationPair: OscillationPair | null;
  oscillationCount: number;
  oscillationWindowStartedAt: number;
  lastObservationAt: number;
  frozenMinHeight: number | null;
};

export type StableVirtualRowMeasurementSnapshot =
  StableVirtualRowMeasurementState;

const createInitialState = (): StableVirtualRowMeasurementState => ({
  committedHeight: null,
  pendingHeight: null,
  previousObservedHeight: null,
  oscillationPair: null,
  oscillationCount: 0,
  oscillationWindowStartedAt: 0,
  lastObservationAt: 0,
  frozenMinHeight: null,
});

export function createStableVirtualRowMeasurementState(
  config: StableVirtualRowMeasurementConfig = STABLE_VIRTUAL_ROW_MEASUREMENT_CONFIG,
) {
  let state = createInitialState();

  const commitObservedHeight = (
    rawHeight: number,
    now = Date.now(),
  ): number | null => {
    const roundedHeight = Math.ceil(rawHeight);
    if (roundedHeight <= 0) return null;

    if (
      state.frozenMinHeight !== null &&
      now - state.lastObservationAt > config.oscillationWindowMs
    ) {
      state.frozenMinHeight = null;
      state.oscillationPair = null;
      state.oscillationCount = 0;
      state.oscillationWindowStartedAt = 0;
      state.previousObservedHeight = null;
    }
    state.lastObservationAt = now;

    const previousObservedHeight = state.previousObservedHeight;
    if (
      previousObservedHeight !== null &&
      previousObservedHeight !== roundedHeight
    ) {
      const nextPair: OscillationPair = [
        Math.min(previousObservedHeight, roundedHeight),
        Math.max(previousObservedHeight, roundedHeight),
      ];
      const previousPair = state.oscillationPair;

      if (
        now - state.oscillationWindowStartedAt > config.oscillationWindowMs ||
        !previousPair ||
        previousPair[0] !== nextPair[0] ||
        previousPair[1] !== nextPair[1]
      ) {
        state.oscillationWindowStartedAt = now;
        state.oscillationPair = nextPair;
        state.oscillationCount = 1;
      } else {
        state.oscillationWindowStartedAt = now;
        state.oscillationCount += 1;
      }
    }

    state.previousObservedHeight = roundedHeight;

    const committedHeight = state.committedHeight;
    if (
      state.oscillationCount >= config.maxOscillationCount &&
      committedHeight !== null
    ) {
      state.frozenMinHeight = Math.max(committedHeight, roundedHeight);
    }

    const nextHeight =
      state.frozenMinHeight === null
        ? roundedHeight
        : Math.max(state.frozenMinHeight, roundedHeight);

    if (
      committedHeight !== null &&
      Math.abs(committedHeight - nextHeight) < 1
    ) {
      return null;
    }

    state.committedHeight = nextHeight;
    return nextHeight;
  };

  return {
    reset() {
      state = createInitialState();
    },
    setPendingHeight(height: number, now = Date.now()) {
      state.pendingHeight = height;
      if (Math.ceil(height) > 0) {
        state.lastObservationAt = now;
      }
    },
    hasPendingHeight() {
      return state.pendingHeight !== null;
    },
    commitHeight(height: number, now?: number) {
      state.pendingHeight = null;
      return commitObservedHeight(height, now);
    },
    commitPendingHeight(now?: number) {
      const pendingHeight = state.pendingHeight;
      state.pendingHeight = null;
      return pendingHeight === null
        ? null
        : commitObservedHeight(pendingHeight, now);
    },
    getSnapshot(): StableVirtualRowMeasurementSnapshot {
      return {
        ...state,
        oscillationPair: state.oscillationPair
          ? [...state.oscillationPair]
          : null,
      };
    },
  };
}
