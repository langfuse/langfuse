import type { FilterState } from "@langfuse/shared";

export type AiFilterResult =
  | {
      status: "complete";
      filters: FilterState;
      queryText: string;
      unknownScoreNames: string[];
    }
  | {
      status: "incomplete";
      unknownScoreNames: string[];
    };
