import { type availableFlags } from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in Exclude<
    Flag,
    | "modernSession"
    | "normalizedIoPreview"
    | "aiGateway"
    | "sessionTimeline"
    | "traceMessages"
    | "decisionModelEvaluators"
  >]: boolean;
} & {
  // Optional while older sessions and test fixtures roll across new flags.
  modernSession?: boolean;
  normalizedIoPreview?: boolean;
  aiGateway?: boolean;
  sessionTimeline?: boolean;
  traceMessages?: boolean;
  decisionModelEvaluators?: boolean;
};
