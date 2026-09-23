import {
  type INTERNAL_FEATURE_FLAG,
  type availableFlags,
} from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in Exclude<
    Flag,
    | "modernSession"
    | "aiGateway"
    | "sessionTimeline"
    | typeof INTERNAL_FEATURE_FLAG
  >]: boolean;
} & {
  // Optional while older sessions and test fixtures roll across new flags.
  modernSession?: boolean;
  aiGateway?: boolean;
  sessionTimeline?: boolean;
  [INTERNAL_FEATURE_FLAG]?: boolean;
};
