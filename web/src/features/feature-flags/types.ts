import {
  type INTERNAL_FEATURE_FLAG,
  type availableFlags,
} from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in Exclude<
    Flag,
    | "sessionViewV2"
    | "aiGateway"
    | "unifiedTraceSessionView"
    | "sessionViewV2Timeline"
    | typeof INTERNAL_FEATURE_FLAG
  >]: boolean;
} & {
  // Optional while older sessions and test fixtures roll across new flags.
  sessionViewV2?: boolean;
  aiGateway?: boolean;
  unifiedTraceSessionView?: boolean;
  sessionViewV2Timeline?: boolean;
  [INTERNAL_FEATURE_FLAG]?: boolean;
};
