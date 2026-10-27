import {
  type INTERNAL_FEATURE_FLAG,
  type availableFlags,
} from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in Exclude<
    Flag,
    | "skillManagement"
    | "externalMediaStorage"
    | "sessionViewV2"
    | "aiGateway"
    | "sessionViewV2Timeline"
    | typeof INTERNAL_FEATURE_FLAG
  >]: boolean;
} & {
  // Optional while older sessions and test fixtures roll across new flags.
  skillManagement?: boolean;
  externalMediaStorage?: boolean;
  sessionViewV2?: boolean;
  aiGateway?: boolean;
  sessionViewV2Timeline?: boolean;
  [INTERNAL_FEATURE_FLAG]?: boolean;
};
