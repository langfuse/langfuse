export const log = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console -- logger
  console.log("LOGGER: ", ...args);
};

export const sum = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
