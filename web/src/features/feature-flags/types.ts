import { type availableFlags } from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in Exclude<Flag, "modernSession" | "v4UpgradeUi">]: boolean;
} & {
  // Optional while older sessions and test fixtures roll across new flags.
  modernSession?: boolean;
  v4UpgradeUi?: boolean;
};
