import { type availableFlags } from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in Exclude<Flag, "traceStation">]: boolean;
} & {
  // Optional while older sessions and test fixtures roll across the new flag.
  traceStation?: boolean;
};
