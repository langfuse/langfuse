import React from "react";

type UseDynamicDebounceConfig = {
  defaultDelay?: number;
  maxSamples?: number;
  minSamples?: number;
  minDelay?: number;
  maxDelay?: number;
  delayFunction?: (averageGap: number) => number;
};

type UseDynamicDebounceBag = {
  isDebouncing: boolean;
  delay: number;
};

const defaultConfig: Required<UseDynamicDebounceConfig> = {
  defaultDelay: 200,
  maxSamples: 8,
  minSamples: 2,
  minDelay: 0,
  maxDelay: 800,
  delayFunction: (gap) => Math.floor(Math.log(gap + 1) * 100),
};

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

function calculateAverageGap(timings: number[]): number {
  if (timings.length < 2) {
    return 0;
  }

  let sum = 0;
  let prev = timings[0]!;
  for (let i = 1; i < timings.length; i++) {
    sum += timings[i]! - prev;
    prev = timings[i]!;
  }

  return sum / (timings.length - 1);
}

function parseConfig(
  config?: UseDynamicDebounceConfig,
): Required<UseDynamicDebounceConfig> {
  if (!config) return defaultConfig;
  const conf = { ...defaultConfig, ...config };

  const minDelay = Math.max(conf.minDelay, 0);
  const maxDelay = Math.max(minDelay, conf.maxDelay);

  const minSamples = Math.max(conf.minSamples, 2);
  const maxSamples = Math.max(conf.maxSamples, 2);

  const defaultDelay = Math.max(conf.defaultDelay, 0);

  return {
    ...conf,
    minDelay,
    maxDelay,
    minSamples,
    maxSamples,
    defaultDelay,
  };
}

export function useDynamicDebounceCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  config?: UseDynamicDebounceConfig,
): [(...args: T) => void, UseDynamicDebounceBag] {
  const {
    defaultDelay,
    minSamples,
    maxSamples,
    delayFunction,
    minDelay,
    maxDelay,
  } = parseConfig(config);
  const storedCallback = React.useRef(callback);
  const timer = React.useRef<ReturnType<typeof setTimeout>>();
  const [isDebouncing, setIsDebouncing] = React.useState(false);
  const samples = React.useRef<number[]>([]);
  const [delay, setDelay] = React.useState<number>(defaultDelay);

  React.useEffect(() => {
    storedCallback.current = callback;
  }, [callback]);

  React.useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
      timer.current = undefined;
    },
    [],
  );

  return [
    React.useCallback((...args: T) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }

      samples.current = [
        ...(samples.current.length >= maxSamples
          ? samples.current.slice(1)
          : samples.current),
        performance.now(),
      ];

      const newDelay = clamp(
        samples.current.length >= minSamples
          ? delayFunction(calculateAverageGap(samples.current))
          : defaultDelay,
        minDelay,
        maxDelay,
      );
      console.log(newDelay);
      setDelay(newDelay);
      setIsDebouncing(true);

      timer.current = setTimeout(() => {
        setIsDebouncing(false);
        samples.current = [];
        setDelay(defaultDelay);
        storedCallback.current.apply(null, args);
      }, newDelay);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    { isDebouncing, delay },
  ];
}

export function useDynamicDebounce<S = undefined>(): [
  S | undefined,
  React.Dispatch<React.SetStateAction<S | undefined>>,
  UseDynamicDebounceBag,
];

export function useDynamicDebounce<S>(
  initialState: S | (() => S),
  config?: UseDynamicDebounceConfig,
): [S, React.Dispatch<React.SetStateAction<S>>, UseDynamicDebounceBag];

export function useDynamicDebounce<S = undefined>(
  initialState?: S | (() => S),
  config?: UseDynamicDebounceConfig,
) {
  const [state, setState] = React.useState(initialState);
  return [state, ...useDynamicDebounceCallback(setState, config)];
}
