import type { ReactNode } from "react";

type SweepNavigate = () => Promise<unknown> | void;

type SweepHandle = {
  midpoint: Promise<void>;
  done: Promise<void>;
  cancel: () => void;
};

type SweepFn = (navigate: SweepNavigate) => SweepHandle;

export const mockGlimmProviderProps: Array<Record<string, unknown>> = [];

let mockSweepImplementation: SweepFn | null = null;

export function resetMockGlimm() {
  mockGlimmProviderProps.length = 0;
  mockSweepImplementation = null;
}

export function setMockGlimmSweep(sweep: SweepFn) {
  mockSweepImplementation = sweep;
}

export function GlimmProvider({
  children,
  ...props
}: Record<string, unknown> & { children: ReactNode }) {
  mockGlimmProviderProps.push(props);

  return <>{children}</>;
}

export function useGlimm() {
  return {
    defaults: {},
    sweep: (navigate: SweepNavigate) => {
      if (mockSweepImplementation) {
        return mockSweepImplementation(navigate);
      }

      const midpoint = Promise.resolve().then(async () => {
        await navigate();
      });

      return {
        midpoint,
        done: midpoint,
        cancel: () => undefined,
      };
    },
  };
}
